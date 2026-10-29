import JSZip from 'jszip';
import type { LlmClient } from '../../llm/LlmClient';
import { binaryChecksum } from '../../crypto-checksum';
import { proseToWordTokens } from '../../prepare/proseToStream';
import { docKeyFromSourcePath } from '../../store/docKey';
import type { BookCacheIndex, BookChapter, BookSectionKind } from '../../types/m2Contracts';
import { buildChapterId, spineNumberFromChapterId } from '../bookChapterIds';
import { resolveChapterTitlesViaLlm } from './epubChapterIndexLlm';
import {
	loadNavigationEntries,
	mapNavEntriesToSpine,
	navSplitPointsBySpine,
	normalizePath,
	parseOpf,
	resolveRelative,
	spineContentPaths,
	type NavSpineSplit
} from './epubNavigation';
import {
	applyLlmChapterTitle,
	bodyHeadingFromHtml,
	buildSpineSnapshots,
	detectSpecialPages,
	finalFallbackTitle,
	firstLineTitle,
	inferSectionKindFromTitle,
	isLikelyCoverTitle,
	isSpineFallbackTitle,
	needsLlmTitles,
	resolveChapterTitle
} from './epubTitleResolution';

/**
 * Bump when parsing changes what an index contains; caches built by an older parser are
 * re-parsed the next time the book opens.
 * 2: clean HTML-escaped TOC labels, split files holding several TOC chapters.
 */
export const EPUB_PARSER_VERSION = 2;

export interface EpubParseOptions {
	llm?: LlmClient;
	/**
	 * Index from an earlier parse of the same book. Its real titles fill spine items the
	 * TOC leaves unnamed, and AI naming is skipped so an automatic re-parse stays quick.
	 */
	previousIndex?: BookCacheIndex;
	/** Fired immediately before the one-shot chapter-index LLM request. */
	onLlmChapterIndexStart?: () => void;
	/** Fired after the LLM request finishes (success or failure). */
	onLlmChapterIndexEnd?: () => void;
}

export interface EpubParseResult {
	index: BookCacheIndex;
	coverBytes: Uint8Array | null;
}

const EPUB_BLOCK_SELECTOR = 'p, div, li, h1, h2, h3, h4, h5, h6, blockquote';

function inlineTextFromElement(el: Element): string {
	return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

interface HtmlBlock {
	el: Element;
	text: string;
}

function htmlToBlocks(html: string): { doc: Document; blocks: HtmlBlock[] } {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	for (const el of doc.querySelectorAll('script, style, nav, header, footer')) {
		el.remove();
	}
	const blocks: HtmlBlock[] = [];
	if (doc.body) {
		collectHtmlBlocks(doc.body, blocks);
	}
	return { doc, blocks };
}

/** Block-aware HTML extract: preserves paragraph breaks as `\n\n` between block elements. */
export function htmlToPlainText(html: string): string {
	return htmlToBlocks(html)
		.blocks.map((b) => b.text)
		.join('\n\n');
}

function collectHtmlBlocks(parent: Element, blocks: HtmlBlock[]): void {
	let foundChildBlock = false;

	for (const child of Array.from(parent.children)) {
		if (child.matches(EPUB_BLOCK_SELECTOR)) {
			foundChildBlock = true;
			const text = inlineTextFromElement(child);
			if (text) {
				blocks.push({ el: child, text });
			}
		} else {
			collectHtmlBlocks(child, blocks);
		}
	}

	if (!foundChildBlock && parent.tagName === 'BODY') {
		const text = inlineTextFromElement(parent);
		if (text) {
			blocks.push({ el: parent, text });
		}
	}
}

/** A spine file's text cut at TOC anchors; `label` may be undefined for a lead-in before the first. */
interface SpineSegment {
	label?: string;
	plain: string;
}

/** Lead-in text shorter than this joins the first TOC chapter instead of standing alone. */
const MIN_LEAD_IN_WORDS = 50;
/**
 * Below this average a file's anchors mark aphorisms or short sections, not chapters;
 * splitting would bury the index and pause playback every few hundred words.
 */
const MIN_AVG_SPLIT_WORDS = 1000;

function anchorElement(doc: Document, fragment: string): Element | null {
	return doc.getElementById(fragment) ?? doc.getElementsByName(fragment)[0] ?? null;
}

/** First block at or after the anchor, so text before it stays with the previous chapter. */
function blockIndexForAnchor(blocks: HtmlBlock[], anchor: Element): number {
	return blocks.findIndex(
		(b) =>
			b.el === anchor ||
			b.el.contains(anchor) ||
			(anchor.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
	);
}

/**
 * Cut one spine file into chapters at its TOC anchors. Returns null when fewer than two
 * anchors resolve in order, leaving the file as a single chapter.
 */
export function splitSpineAtAnchors(html: string, split: NavSpineSplit): SpineSegment[] | null {
	const { doc, blocks } = htmlToBlocks(html);
	const starts: Array<{ label: string; block: number }> = [];
	for (const point of split.points) {
		const anchor = anchorElement(doc, point.fragment);
		const block = anchor ? blockIndexForAnchor(blocks, anchor) : -1;
		const last = starts[starts.length - 1];
		if (block < 0 || (last && block <= last.block)) {
			continue;
		}
		starts.push({ label: point.label, block });
	}
	if (starts.length < 2) {
		return null;
	}

	const textOf = (from: number, to: number) =>
		blocks
			.slice(from, to)
			.map((b) => b.text)
			.join('\n\n');

	const chapters: SpineSegment[] = starts.map((start, i) => ({
		label: start.label,
		plain: textOf(start.block, starts[i + 1]?.block ?? blocks.length)
	}));
	const chapterWords = chapters.reduce((sum, c) => sum + proseToWordTokens(c.plain).length, 0);
	if (chapterWords / chapters.length < MIN_AVG_SPLIT_WORDS) {
		return null;
	}

	const leadIn = textOf(0, starts[0]!.block);
	if (!leadIn) {
		return chapters;
	}
	if (proseToWordTokens(leadIn).length >= MIN_LEAD_IN_WORDS) {
		return [{ label: split.leadInLabel, plain: leadIn }, ...chapters];
	}
	chapters[0]!.plain = `${leadIn}\n\n${chapters[0]!.plain}`;
	return chapters;
}

/** Real titles from an earlier index, keyed by spine index (whole-file chapters only). */
function previousTitlesBySpine(previous: BookCacheIndex | undefined): Map<number, string> {
	const titles = new Map<number, string>();
	for (const chapter of previous?.chapters ?? []) {
		const spine = spineNumberFromChapterId(chapter.chapterId);
		if (spine === undefined || chapter.chapterId.startsWith(`${String(spine).padStart(2, '0')}.`)) {
			continue;
		}
		const spineIndex = spine - 1;
		const title = chapter.title.trim();
		if (!title || /[<>]/.test(title) || isSpineFallbackTitle(title, spineIndex)) {
			continue;
		}
		titles.set(spineIndex, title);
	}
	return titles;
}

export function tokenizePlainWithParagraphStarts(plain: string): {
	words: string[];
	paragraphStarts: number[];
} {
	const paragraphs = plain
		.split(/\n\n+/)
		.map((p) => p.trim())
		.filter(Boolean);

	if (paragraphs.length === 0) {
		const trimmed = plain.trim();
		if (!trimmed) {
			return { words: [], paragraphStarts: [] };
		}
		const words = proseToWordTokens(trimmed).map((t) => t.text ?? '');
		return { words, paragraphStarts: words.length > 0 ? [0] : [] };
	}

	const words: string[] = [];
	const paragraphStarts: number[] = [];

	for (const paragraph of paragraphs) {
		paragraphStarts.push(words.length);
		words.push(...proseToWordTokens(paragraph).map((t) => t.text ?? ''));
	}

	return { words, paragraphStarts };
}

function firstImageHrefFromHtml(html: string, chapterDir: string, opfDir: string): string | undefined {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const src = doc.querySelector('img[src]')?.getAttribute('src');
	if (!src || src.startsWith('data:')) {
		return undefined;
	}
	return resolveRelative(chapterDir || opfDir, src);
}

export async function parseEpubBytes(
	sourcePath: string,
	bytes: ArrayBuffer,
	options: EpubParseOptions = {}
): Promise<EpubParseResult> {
	const zip = await JSZip.loadAsync(bytes);
	const containerXml = await zip.file('META-INF/container.xml')?.async('text');
	if (!containerXml) {
		throw new Error('Invalid EPUB: missing container.xml');
	}

	const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
	const rootfilePath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
	if (!rootfilePath) {
		throw new Error('Invalid EPUB: missing OPF path');
	}

	const opfPath = normalizePath(rootfilePath);
	const opfDir = opfPath.includes('/') ? opfPath.replace(/[/][^/]+$/, '') : '';
	const opfXml = await zip.file(opfPath)?.async('text');
	if (!opfXml) {
		throw new Error('Invalid EPUB: missing OPF file');
	}

	const { title, author, spineHrefs, coverHref, navHref, ncxHref } = parseOpf(opfXml);
	const spinePaths = spineContentPaths(opfDir, spineHrefs);

	const navEntries = await loadNavigationEntries(zip, opfDir, navHref, ncxHref, spinePaths);
	const navTitles = mapNavEntriesToSpine(navEntries, spinePaths);
	const splitPoints = navSplitPointsBySpine(navEntries, spinePaths);
	const previousTitles = previousTitlesBySpine(options.previousIndex);

	const spineItems: Array<{
		spineIndex: number;
		html: string;
		plain: string;
		words: string[];
		paragraphStarts: number[];
		chapterPath: string;
		/** Set when the TOC splits this file into several chapters. */
		segments: SpineSegment[] | null;
	}> = [];

	for (let i = 0; i < spineHrefs.length; i++) {
		const href = spineHrefs[i];
		if (!href) continue;
		const chapterPath = spinePaths[i] ?? resolveRelative(opfDir, href);
		const html = await zip.file(chapterPath)?.async('text');
		if (!html) continue;

		const plain = htmlToPlainText(html);
		const { words, paragraphStarts } = tokenizePlainWithParagraphStarts(plain);
		const split = splitPoints.get(i);
		const segments = split ? splitSpineAtAnchors(html, split) : null;
		spineItems.push({ spineIndex: i, html, plain, words, paragraphStarts, chapterPath, segments });
	}

	if (spineItems.length === 0) {
		throw new Error('EPUB contains no readable chapters');
	}

	const titleBySpine = new Map<number, string>();
	const kindBySpine = new Map<number, BookSectionKind>();

	for (const item of spineItems) {
		const navTitle = item.segments?.[0]?.label ?? navTitles.get(item.spineIndex);
		const heading = bodyHeadingFromHtml(item.html);
		let resolved = resolveChapterTitle(navTitle, heading, title, item.spineIndex);
		const previous = previousTitles.get(item.spineIndex);
		if (previous && isSpineFallbackTitle(resolved, item.spineIndex)) {
			resolved = previous;
		}
		titleBySpine.set(item.spineIndex, resolved);
		const inferred = inferSectionKindFromTitle(titleBySpine.get(item.spineIndex)!);
		if (inferred) {
			kindBySpine.set(item.spineIndex, inferred);
		}
	}

	const shouldRunLlm = needsLlmTitles({
		spineCount: spineItems.length,
		navMappedCount: navTitles.size,
		titlesBySpine: titleBySpine,
		spineItems
	});

	if (shouldRunLlm && options.llm && !options.previousIndex) {
		const specialPages = detectSpecialPages(
			spineItems.map((item) => ({
				spineIndex: item.spineIndex,
				html: item.html,
				plain: item.plain
			}))
		);
		const spineSnapshots = buildSpineSnapshots(spineItems, titleBySpine);

		try {
			options.onLlmChapterIndexStart?.();
			const llmResult = await resolveChapterTitlesViaLlm(options.llm, {
				bookTitle: title,
				spineSnapshots,
				specialPages
			});

			for (const [index, llmTitle] of llmResult.titles) {
				const existing = titleBySpine.get(index);
				const applied = applyLlmChapterTitle(llmTitle, title, index);
				titleBySpine.set(index, applied);
				if (llmResult.kinds.has(index)) {
					kindBySpine.set(index, llmResult.kinds.get(index)!);
				} else if (!existing || applied !== existing) {
					const inferred = inferSectionKindFromTitle(applied);
					if (inferred) {
						kindBySpine.set(index, inferred);
					}
				}
			}
		} catch {
			// Keep nav/heading titles on LLM failure.
		} finally {
			options.onLlmChapterIndexEnd?.();
		}
	}

	const chapters: BookChapter[] = [];
	let totalWordCount = 0;

	const pushChapter = (
		spineIndex: number,
		segmentIndex: number,
		chapterTitle: string,
		sectionKind: BookSectionKind | undefined,
		words: string[],
		paragraphStarts: number[]
	) => {
		const chapter: BookChapter = {
			chapterId: buildChapterId(spineIndex, segmentIndex, chapterTitle),
			title: chapterTitle,
			wordCount: words.length,
			words
		};
		if (paragraphStarts.length > 0) {
			chapter.paragraphStarts = paragraphStarts;
		}
		if (sectionKind) {
			chapter.sectionKind = sectionKind;
		}
		chapters.push(chapter);
		totalWordCount += words.length;
	};


	/**
	 * Name text that precedes a file's first TOC anchor. Converters often split files by
	 * size, so it is usually the tail of the previous chapter.
	 */
	const leadInTitle = (plain: string): string => {
		const previous = [...chapters]
			.reverse()
			.find((c) => c.wordCount > 0 && !/^Section \d+$/.test(c.title));
		if (previous) {
			return `${previous.title.replace(/ \(continued\)$/, '')} (continued)`;
		}
		return firstLineTitle(plain, title) ?? 'Front Matter';
	};

	for (const item of spineItems) {
		if (item.segments) {
			item.segments.forEach((segment, segmentIndex) => {
				const { words, paragraphStarts } = tokenizePlainWithParagraphStarts(segment.plain);
				const segmentTitle = segment.label ?? leadInTitle(segment.plain);
				pushChapter(
					item.spineIndex,
					segmentIndex,
					segmentTitle,
					inferSectionKindFromTitle(segmentTitle),
					words,
					paragraphStarts
				);
			});
			continue;
		}

		let sectionKind = kindBySpine.get(item.spineIndex);
		let chapterTitle = finalFallbackTitle(
			titleBySpine.get(item.spineIndex),
			item.spineIndex,
			sectionKind
		);
		const named = isSpineFallbackTitle(chapterTitle, item.spineIndex)
			? firstLineTitle(item.plain, title)
			: undefined;
		if (named) {
			chapterTitle = named;
			sectionKind ??= inferSectionKindFromTitle(named);
		}
		pushChapter(
			item.spineIndex,
			0,
			chapterTitle,
			sectionKind,
			item.words,
			item.paragraphStarts
		);
	}

	let coverBytes: Uint8Array | null = null;
	if (coverHref) {
		const coverPath = resolveRelative(opfDir, coverHref);
		const coverFile = zip.file(coverPath);
		if (coverFile) {
			coverBytes = await coverFile.async('uint8array');
		}
	}

	if (!coverBytes) {
		const firstItem = spineItems[0];
		if (firstItem && firstItem.words.length === 0) {
			const chapterDir = firstItem.chapterPath.includes('/')
				? firstItem.chapterPath.replace(/[/][^/]+$/, '')
				: opfDir;
			const inlineCover = firstImageHrefFromHtml(firstItem.html, chapterDir, opfDir);
			if (inlineCover) {
				const coverFile = zip.file(inlineCover);
				if (coverFile) {
					coverBytes = await coverFile.async('uint8array');
				}
			}
		}
	}

	if (chapters[0] && chapters[0].wordCount === 0 && coverBytes && coverBytes.length > 0) {
		chapters[0].isCover = true;
		chapters[0].sectionKind = 'cover';
	} else if (
		chapters[0] &&
		chapters[0].wordCount === 0 &&
		isLikelyCoverTitle(chapters[0].title)
	) {
		chapters[0].isCover = true;
		chapters[0].sectionKind = 'cover';
	}

	const sourceChecksum = await binaryChecksum(bytes);
	const docKey = docKeyFromSourcePath(sourcePath);

	return {
		index: {
			docKey,
			sourcePath,
			sourceChecksum,
			title,
			author,
			totalWordCount,
			chapters,
			parsedAt: new Date().toISOString(),
			parserVersion: EPUB_PARSER_VERSION
		},
		coverBytes
	};
}
