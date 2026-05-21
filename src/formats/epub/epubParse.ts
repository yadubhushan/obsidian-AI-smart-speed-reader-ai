import JSZip from 'jszip';
import type { LlmClient } from '../../llm/LlmClient';
import { binaryChecksum } from '../../crypto-checksum';
import { proseToWordTokens } from '../../prepare/proseToStream';
import { docKeyFromSourcePath } from '../../store/docKey';
import type { BookCacheIndex, BookChapter, BookSectionKind } from '../../types/m2Contracts';
import { resolveChapterTitlesViaLlm } from './epubChapterIndexLlm';
import {
	loadNavigationTitles,
	normalizePath,
	parseOpf,
	resolveRelative,
	spineContentPaths
} from './epubNavigation';
import {
	applyLlmChapterTitle,
	bodyHeadingFromHtml,
	buildSpineSnapshots,
	detectSpecialPages,
	finalFallbackTitle,
	inferSectionKindFromTitle,
	isLikelyCoverTitle,
	needsLlmTitles,
	resolveChapterTitle
} from './epubTitleResolution';

export interface EpubParseOptions {
	llm?: LlmClient;
	/** Fired immediately before the one-shot chapter-index LLM request. */
	onLlmChapterIndexStart?: () => void;
	/** Fired after the LLM request finishes (success or failure). */
	onLlmChapterIndexEnd?: () => void;
}

export interface EpubParseResult {
	index: BookCacheIndex;
	coverBytes: Uint8Array | null;
}

function slugify(value: string, fallback: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || fallback;
}

function htmlToPlainText(html: string): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	for (const el of doc.querySelectorAll('script, style, nav, header, footer')) {
		el.remove();
	}
	const text = doc.body?.textContent ?? '';
	return text.replace(/\s+/g, ' ').trim();
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

	const navTitles = await loadNavigationTitles(zip, opfDir, navHref, ncxHref, spinePaths);

	const spineItems: Array<{
		spineIndex: number;
		html: string;
		plain: string;
		words: string[];
		chapterPath: string;
	}> = [];

	for (let i = 0; i < spineHrefs.length; i++) {
		const href = spineHrefs[i];
		if (!href) continue;
		const chapterPath = spinePaths[i] ?? resolveRelative(opfDir, href);
		const html = await zip.file(chapterPath)?.async('text');
		if (!html) continue;

		const plain = htmlToPlainText(html);
		const words = proseToWordTokens(plain).map((t) => t.text ?? '');
		spineItems.push({ spineIndex: i, html, plain, words, chapterPath });
	}

	if (spineItems.length === 0) {
		throw new Error('EPUB contains no readable chapters');
	}

	const titleBySpine = new Map<number, string>();
	const kindBySpine = new Map<number, BookSectionKind>();

	for (const item of spineItems) {
		const navTitle = navTitles.get(item.spineIndex);
		const heading = bodyHeadingFromHtml(item.html);
		titleBySpine.set(
			item.spineIndex,
			resolveChapterTitle(navTitle, heading, title, item.spineIndex)
		);
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

	if (shouldRunLlm && options.llm) {
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

	for (const item of spineItems) {
		const sectionKind = kindBySpine.get(item.spineIndex);
		const chapterTitle = finalFallbackTitle(
			titleBySpine.get(item.spineIndex),
			item.spineIndex,
			sectionKind
		);
		const chapterId = `${String(item.spineIndex + 1).padStart(2, '0')}-${slugify(
			chapterTitle,
			`chapter-${String(item.spineIndex + 1).padStart(2, '0')}`
		)}`;

		const chapter: BookChapter = {
			chapterId,
			title: chapterTitle,
			wordCount: item.words.length,
			words: item.words
		};
		if (sectionKind) {
			chapter.sectionKind = sectionKind;
		}
		chapters.push(chapter);
		totalWordCount += item.words.length;
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
			parsedAt: new Date().toISOString()
		},
		coverBytes
	};
}
