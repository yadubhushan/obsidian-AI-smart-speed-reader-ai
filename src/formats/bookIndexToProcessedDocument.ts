import { proseToWordTokens } from '../prepare/proseToStream';
import type { BookCacheIndex, BookPosition } from '../types/m2Contracts';
import type { ProcessedDocument, ProcessedSection } from '../types/processedDocument';

export function bookIndexToProcessedDocument(index: BookCacheIndex): ProcessedDocument {
	const sections: ProcessedSection[] = index.chapters.map((chapter) => {
		const section: ProcessedSection = {
			sectionId: chapter.chapterId,
			title: chapter.title,
			stream: proseToWordTokens(chapter.words.join(' '))
		};
		if (chapter.paragraphStarts && chapter.paragraphStarts.length > 0) {
			section.paragraphStarts = chapter.paragraphStarts;
		}
		return section;
	});

	return {
		kind: 'sections',
		processorId: 'sections',
		meta: {
			sourcePath: index.sourcePath,
			sourceChecksum: index.sourceChecksum,
			processedAt: index.parsedAt,
			model: 'deterministic',
			prepareStrategy: 'single'
		},
		sections
	};
}

export function bookPositionToEngineIndices(
	index: BookCacheIndex,
	position?: BookPosition
): { sectionIndex: number; tokenIndex: number } {
	if (!position) {
		return { sectionIndex: 0, tokenIndex: 0 };
	}

	const sectionIndex = index.chapters.findIndex((c) => c.chapterId === position.chapterId);
	if (sectionIndex < 0) {
		return { sectionIndex: 0, tokenIndex: 0 };
	}

	const chapter = index.chapters[sectionIndex];
	if (!chapter) {
		return { sectionIndex: 0, tokenIndex: 0 };
	}
	const tokenIndex = Math.max(0, Math.min(position.wordIndex, Math.max(chapter.wordCount - 1, 0)));
	return { sectionIndex, tokenIndex };
}

export function defaultBookPosition(index: BookCacheIndex): BookPosition {
	const first = index.chapters[0];
	return {
		chapterId: first?.chapterId ?? 'chapter-01',
		wordIndex: 0
	};
}

export function bookPositionFromReadingState(
	index: BookCacheIndex,
	position: BookPosition | undefined
): BookPosition {
	if (!position || !('chapterId' in position)) {
		return defaultBookPosition(index);
	}
	const exists = index.chapters.some((c) => c.chapterId === position.chapterId);
	return exists ? position : defaultBookPosition(index);
}
