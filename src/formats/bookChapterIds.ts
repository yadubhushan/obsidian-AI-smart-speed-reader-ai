import type { BookCacheIndex, BookPosition } from '../types/m2Contracts';

function slugify(value: string, fallback: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || fallback;
}

/**
 * `NN-slug` for a whole spine file, `NN.K-slug` for the K-th chapter split out of it.
 * The spine number prefix is stable across re-parses even when the title changes.
 */
export function buildChapterId(spineIndex: number, segmentIndex: number, title: string): string {
	const spine = String(spineIndex + 1).padStart(2, '0');
	const prefix = segmentIndex > 0 ? `${spine}.${segmentIndex + 1}` : spine;
	return `${prefix}-${slugify(title, `chapter-${spine}`)}`;
}

/** Spine number (1-based) encoded in a chapter id, or undefined for foreign ids. */
export function spineNumberFromChapterId(chapterId: string): number | undefined {
	const match = /^(\d+)(?:\.\d+)?-/.exec(chapterId);
	return match ? Number.parseInt(match[1] ?? '', 10) : undefined;
}

/**
 * Find a saved position in the current index. An exact id wins; otherwise the id's spine
 * number locates the chapter(s) built from that file, so positions and bookmarks saved
 * before a re-parse (renamed or split chapters) still land on the same word.
 */
export function resolveBookPosition(
	index: BookCacheIndex,
	position: BookPosition
): { chapterIndex: number; wordIndex: number } | null {
	const spine = spineNumberFromChapterId(position.chapterId);
	let chapterIndex = index.chapters.findIndex((c) => c.chapterId === position.chapterId);
	if (chapterIndex < 0) {
		if (spine === undefined) {
			return null;
		}
		chapterIndex = index.chapters.findIndex(
			(c) => spineNumberFromChapterId(c.chapterId) === spine
		);
		if (chapterIndex < 0) {
			return null;
		}
	}

	// A position saved before its file was split can point past this part: carry the
	// overflow into the following parts of the same file.
	let wordIndex = Math.max(0, position.wordIndex);
	while (spine !== undefined) {
		const count = index.chapters[chapterIndex]?.wordCount ?? 0;
		const next = index.chapters[chapterIndex + 1];
		if (wordIndex < count || !next || spineNumberFromChapterId(next.chapterId) !== spine) {
			break;
		}
		wordIndex -= count;
		chapterIndex++;
	}
	return { chapterIndex, wordIndex };
}
