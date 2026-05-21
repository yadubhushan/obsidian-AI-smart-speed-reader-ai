import type { BookSectionKind } from '../../types/m2Contracts';
import type { SpecialPageCandidate, SpineTitleSnapshot } from './epubChapterIndexLlm';

const CONTENTS_TEXT_RE = /\b(contents|table of contents|chapters)\b/i;
const PREFACE_TEXT_RE = /\b(preface|foreword)\b/i;
const INTRO_TEXT_RE = /\b(introduction)\b/i;
const APPENDIX_TEXT_RE = /\b(appendix|bibliography|notes|index)\b/i;
const NUMBERED_LINE_RE = /^\d+[\.\)]\s+\S/m;
const CHAPTER_LABEL_RE = /^(?:chapter|ch\.?)\s+[\divxlcdm0-9]+/i;
const FRONT_MATTER_TITLE_RE =
	/^(cover|title\s*page|copyright|contents|table of contents|acknowledgements?|introduction|preface|foreword|chronology|further reading|note on the text)/i;

export function normalizeTitleForCompare(title: string): string {
	return title.trim().toLowerCase();
}

export function isSameAsBookTitle(title: string, bookTitle: string): boolean {
	const a = normalizeTitleForCompare(title);
	const b = normalizeTitleForCompare(bookTitle);
	return a.length > 0 && a === b;
}

export function bodyHeadingFromHtml(html: string): string | undefined {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const heading =
		doc.querySelector('h1')?.textContent?.trim() ??
		doc.querySelector('h2')?.textContent?.trim();
	return heading || undefined;
}

function hasExplicitChapterLabel(navTitle?: string, bodyHeading?: string): boolean {
	const candidate = navTitle?.trim() || bodyHeading?.trim() || '';
	return CHAPTER_LABEL_RE.test(candidate);
}

export function isSpineIndexChapterFallback(title: string, spineIndex: number): boolean {
	return title.trim() === `Chapter ${spineIndex + 1}`;
}

export function isSpineIndexSectionFallback(title: string, spineIndex: number): boolean {
	return title.trim() === `Section ${spineIndex + 1}`;
}

export function resolveChapterTitle(
	navTitle: string | undefined,
	bodyHeading: string | undefined,
	bookTitle: string,
	spineIndex: number
): string {
	let title = navTitle?.trim() || bodyHeading?.trim();
	if (title && isSameAsBookTitle(title, bookTitle)) {
		title = undefined;
	}
	if (title) {
		return title;
	}
	if (hasExplicitChapterLabel(navTitle, bodyHeading)) {
		const explicit = navTitle?.trim() || bodyHeading?.trim();
		if (explicit && !isSameAsBookTitle(explicit, bookTitle)) {
			return explicit;
		}
	}
	return `Section ${spineIndex + 1}`;
}

export function applyLlmChapterTitle(
	llmTitle: string,
	bookTitle: string,
	spineIndex: number
): string {
	const trimmed = llmTitle.trim();
	if (!trimmed) {
		return `Section ${spineIndex + 1}`;
	}
	if (isSameAsBookTitle(trimmed, bookTitle)) {
		return `Section ${spineIndex + 1}`;
	}
	if (isSpineIndexChapterFallback(trimmed, spineIndex)) {
		return `Section ${spineIndex + 1}`;
	}
	return trimmed;
}

export function finalFallbackTitle(
	title: string | undefined,
	spineIndex: number,
	sectionKind?: BookSectionKind
): string {
	if (title?.trim()) {
		return title.trim();
	}
	if (sectionKind === 'body') {
		return `Chapter ${spineIndex + 1}`;
	}
	return `Section ${spineIndex + 1}`;
}

export function inferSectionKindFromTitle(title: string): BookSectionKind | undefined {
	const t = title.trim();
	if (/^cover$/i.test(t)) {
		return 'cover';
	}
	if (FRONT_MATTER_TITLE_RE.test(t)) {
		return 'frontMatter';
	}
	if (APPENDIX_TEXT_RE.test(t)) {
		return 'appendix';
	}
	if (CHAPTER_LABEL_RE.test(t)) {
		return 'body';
	}
	return undefined;
}

export function areChapterTitlesUsable(titles: string[], bookTitle: string): boolean {
	if (titles.length === 0) {
		return false;
	}

	const bookNorm = normalizeTitleForCompare(bookTitle);
	const bookTitleHits = titles.filter((t) => normalizeTitleForCompare(t) === bookNorm).length;
	if (bookTitleHits / titles.length >= 0.4) {
		return false;
	}

	const counts = new Map<string, number>();
	for (const title of titles) {
		const key = normalizeTitleForCompare(title);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const maxSame = Math.max(...counts.values(), 0);
	if (maxSame / titles.length >= 0.4) {
		return false;
	}

	return true;
}

export function needsLlmTitles(params: {
	spineCount: number;
	navMappedCount: number;
	titlesBySpine: Map<number, string>;
	spineItems: Array<{ spineIndex: number }>;
}): boolean {
	if (params.navMappedCount < params.spineCount) {
		return true;
	}
	for (const item of params.spineItems) {
		const resolved = params.titlesBySpine.get(item.spineIndex);
		if (!resolved) {
			return true;
		}
		if (
			isSpineIndexChapterFallback(resolved, item.spineIndex) ||
			isSpineIndexSectionFallback(resolved, item.spineIndex)
		) {
			return true;
		}
	}
	return false;
}

export function detectSpecialPages(
	items: Array<{ spineIndex: number; html: string; plain: string }>,
	maxPages = 4,
	maxChars = 8000
): SpecialPageCandidate[] {
	const scored: Array<{ spineIndex: number; plainText: string; score: number; label: string }> =
		[];

	for (const item of items) {
		let score = 0;
		let label = 'section';
		if (CONTENTS_TEXT_RE.test(item.plain)) {
			score += 4;
			label = 'contents';
		}
		if (PREFACE_TEXT_RE.test(item.plain)) {
			score += 4;
			label = 'preface';
		}
		if (INTRO_TEXT_RE.test(item.plain)) {
			score += 3;
			label = 'introduction';
		}
		if (APPENDIX_TEXT_RE.test(item.plain)) {
			score += 4;
			label = 'appendix';
		}
		const linkCount = (item.html.match(/<a\s+[^>]*href\s*=/gi) ?? []).length;
		if (linkCount >= 5) {
			score += 2;
		}
		if (linkCount >= 12) {
			score += 2;
		}
		const numberedLines = (item.plain.match(NUMBERED_LINE_RE) ?? []).length;
		if (numberedLines >= 3) {
			score += 2;
		}
		if (score > 0) {
			scored.push({
				spineIndex: item.spineIndex,
				plainText: item.plain,
				score,
				label
			});
		}
	}

	scored.sort((a, b) => b.score - a.score);
	const selected: SpecialPageCandidate[] = [];
	let charCount = 0;
	for (const entry of scored) {
		if (selected.length >= maxPages) {
			break;
		}
		const slice = entry.plainText.slice(0, 4000);
		if (charCount + slice.length > maxChars && selected.length > 0) {
			break;
		}
		selected.push({
			spineIndex: entry.spineIndex,
			plainText: slice,
			pageKind: entry.label
		});
		charCount += slice.length;
	}
	return selected;
}

export function buildSpineSnapshots(
	spineItems: Array<{
		spineIndex: number;
		chapterPath: string;
		words: string[];
		plain: string;
	}>,
	titlesBySpine: Map<number, string>
): SpineTitleSnapshot[] {
	return spineItems.map((item) => {
		const title = titlesBySpine.get(item.spineIndex) ?? `Section ${item.spineIndex + 1}`;
		const needsExcerpt =
			isSpineIndexChapterFallback(title, item.spineIndex) ||
			isSpineIndexSectionFallback(title, item.spineIndex);
		return {
			spineIndex: item.spineIndex,
			path: item.chapterPath,
			currentTitle: title,
			wordCount: item.words.length,
			excerpt: needsExcerpt ? item.plain.slice(0, 300) : undefined
		};
	});
}

/** @deprecated Use detectSpecialPages */
export function detectTocCandidatePages(
	items: Array<{ spineIndex: number; html: string; plain: string }>,
	maxPages = 3,
	maxChars = 8000
): SpecialPageCandidate[] {
	return detectSpecialPages(items, maxPages, maxChars);
}

export function isLikelyCoverTitle(title: string): boolean {
	return /^cover$/i.test(title.trim());
}
