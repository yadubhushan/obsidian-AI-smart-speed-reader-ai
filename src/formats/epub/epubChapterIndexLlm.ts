import type { BookSectionKind } from '../../types/m2Contracts';
import type { LlmClient } from '../../llm/LlmClient';
import { runLlmParseWithRetry } from '../../llm/structuredLlmJson';
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

function buildUserPrompt(input: {
	bookTitle: string;
	spineSnapshots: SpineTitleSnapshot[];
	specialPages: SpecialPageCandidate[];
}): string {
	const spineLines = input.spineSnapshots
		.map(
			(s) =>
				`${s.spineIndex}: ${s.path} | title="${s.currentTitle}" | words=${s.wordCount}${
					s.excerpt ? ` | excerpt="${s.excerpt.replace(/"/g, "'")}"` : ''
				}`
		)
		.join('\n');

	const specialBlocks = input.specialPages
		.map(
			(page) =>
				`--- ${page.pageKind} (spine ${page.spineIndex}) ---\n${page.plainText}`
		)
		.join('\n\n');

	const parts = [
		`Book title: ${input.bookTitle}`,
		'',
		'Full spine (must return every index):',
		spineLines
	];
	if (specialBlocks) {
		parts.push('', 'Special pages (contents, preface, appendix, etc.):', specialBlocks);
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
	if (input.spineSnapshots.length === 0) {
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
		if (chapter.spineIndex < input.spineSnapshots.length) {
			titles.set(chapter.spineIndex, chapter.title);
			if (chapter.kind) {
				kinds.set(chapter.spineIndex, chapter.kind);
			}
		}
	}
	return { titles, kinds };
}
