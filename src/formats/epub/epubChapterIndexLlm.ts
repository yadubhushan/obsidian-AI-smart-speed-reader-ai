import type { BookSectionKind } from '../../types/m2Contracts';
import type { LlmClient } from '../../llm/LlmClient';
import { runLlmParseWithRetry } from '../../llm/structuredLlmJson';
import { isSpineIndexChapterFallback, isSpineIndexSectionFallback } from './epubTitleResolution';
import epubChapterIndexPrompt from '../../../config/prompts/epub-chapter-index.txt';

const VALID_KINDS: BookSectionKind[] = ['cover', 'frontMatter', 'body', 'appendix'];

export interface EpubChapterIndexEntry {
	spineIndex: number;
	title: string;
	kind?: BookSectionKind;
}

export interface EpubChapterIndexResult {
	chapters: EpubChapterIndexEntry[];
}

export interface SpecialPageCandidate {
	spineIndex: number;
	plainText: string;
	pageKind: string;
}

/** @deprecated Alias for SpecialPageCandidate */
export type TocCandidatePage = SpecialPageCandidate;

export interface SpineTitleSnapshot {
	spineIndex: number;
	path: string;
	currentTitle: string;
	wordCount: number;
	excerpt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseKind(value: unknown): BookSectionKind | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	return VALID_KINDS.includes(value as BookSectionKind)
		? (value as BookSectionKind)
		: undefined;
}

export function parseEpubChapterIndexResponse(raw: string): EpubChapterIndexResult | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw.trim());
	} catch {
		return null;
	}
	if (!isRecord(parsed) || !Array.isArray(parsed.chapters)) {
		return null;
	}
	const chapters: EpubChapterIndexEntry[] = [];
	const seen = new Set<number>();
	for (const item of parsed.chapters) {
		if (!isRecord(item)) {
			return null;
		}
		const spineIndex = item.spineIndex;
		const title = item.title;
		if (
			typeof spineIndex !== 'number' ||
			!Number.isInteger(spineIndex) ||
			spineIndex < 0 ||
			typeof title !== 'string' ||
			!title.trim() ||
			seen.has(spineIndex)
		) {
			return null;
		}
		seen.add(spineIndex);
		chapters.push({
			spineIndex,
			title: title.trim(),
			kind: parseKind(item.kind)
		});
	}
	if (chapters.length === 0) {
		return null;
	}
	return { chapters };
}

/**
 * Sections still on a `Chapter N` / `Section N` placeholder that have text to go on —
 * the only ones worth asking about. Image-only pages (covers) give the model nothing.
 */
export function isUnresolvedSnapshot(s: SpineTitleSnapshot): boolean {
	return (
		s.wordCount > 0 &&
		(isSpineIndexChapterFallback(s.currentTitle, s.spineIndex) ||
			isSpineIndexSectionFallback(s.currentTitle, s.spineIndex))
	);
}

/** Below this, the excerpt names the page (title page, epigraph, notes); a contents page adds nothing. */
const CONTENTS_PAGE_MIN_WORDS = 300;
const CONTENTS_PAGE_MAX_CHARS = 3000;

function snapshotLine(s: SpineTitleSnapshot, withExcerpt: boolean): string {
	const excerpt = withExcerpt && s.excerpt ? ` | excerpt="${s.excerpt.replace(/"/g, "'")}"` : '';
	return `${s.spineIndex}: ${s.path} | title="${s.currentTitle}" | words=${s.wordCount}${excerpt}`;
}

/**
 * Sends only the unresolved sections, each with its titled neighbours for position,
 * plus the contents page when an unresolved section is long enough to be a real chapter.
 */
export function buildUserPrompt(input: {
	bookTitle: string;
	spineSnapshots: SpineTitleSnapshot[];
	specialPages: SpecialPageCandidate[];
}): string {
	const { spineSnapshots } = input;
	const unresolved = spineSnapshots.filter(isUnresolvedSnapshot);
	const contextIndices = new Set<number>();
	for (const s of unresolved) {
		const pos = spineSnapshots.indexOf(s);
		for (const near of [spineSnapshots[pos - 1], spineSnapshots[pos + 1]]) {
			if (near && !isUnresolvedSnapshot(near)) {
				contextIndices.add(near.spineIndex);
			}
		}
	}

	const parts = [
		`Book title: ${input.bookTitle}`,
		`Total sections: ${spineSnapshots.length}`,
		'',
		'Name these sections (return exactly these indices):',
		...unresolved.map((s) => snapshotLine(s, true))
	];
	const context = spineSnapshots.filter((s) => contextIndices.has(s.spineIndex));
	if (context.length) {
		parts.push('', 'Already-titled neighbours (context only, do not return):');
		parts.push(...context.map((s) => snapshotLine(s, false)));
	}
	const contents = input.specialPages.find((p) => p.pageKind === 'contents');
	if (contents && unresolved.some((s) => s.wordCount >= CONTENTS_PAGE_MIN_WORDS)) {
		parts.push(
			'',
			`--- contents page (spine ${contents.spineIndex}) ---`,
			contents.plainText.slice(0, CONTENTS_PAGE_MAX_CHARS)
		);
	}
	return parts.join('\n').slice(0, 12000);
}

export interface LlmChapterIndexMaps {
	titles: Map<number, string>;
	kinds: Map<number, BookSectionKind>;
}

export async function resolveChapterTitlesViaLlm(
	llm: LlmClient,
	input: {
		bookTitle: string;
		spineSnapshots: SpineTitleSnapshot[];
		specialPages: SpecialPageCandidate[];
	}
): Promise<LlmChapterIndexMaps> {
	const empty = { titles: new Map<number, string>(), kinds: new Map<number, BookSectionKind>() };
	const wanted = new Set(input.spineSnapshots.filter(isUnresolvedSnapshot).map((s) => s.spineIndex));
	// Every section already has a real title: nothing to pay for.
	if (wanted.size === 0) {
		return empty;
	}

	const result = await runLlmParseWithRetry(llm, {
		systemPrompt: epubChapterIndexPrompt.trim(),
		userPrompt: buildUserPrompt(input),
		parse: parseEpubChapterIndexResponse,
		failureMessage: 'EPUB chapter index LLM response was not valid JSON'
	});

	const titles = new Map<number, string>();
	const kinds = new Map<number, BookSectionKind>();
	for (const chapter of result.chapters) {
		// Never let the model overwrite a title the book already gave us.
		if (wanted.has(chapter.spineIndex)) {
			titles.set(chapter.spineIndex, chapter.title);
			if (chapter.kind) {
				kinds.set(chapter.spineIndex, chapter.kind);
			}
		}
	}
	return { titles, kinds };
}
