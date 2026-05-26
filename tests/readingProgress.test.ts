import { describe, expect, it } from 'vitest';
import {
	bookProgressPercent,
	computeDocumentProgressFromEngine,
	defaultNotePosition,
	notePositionFromReadingState,
	notePositionToEngineIndices,
	noteProgressPercent,
	shouldResetReadingState,
	statusFromProgressPercent
} from '../src/reader/readingProgress';
import type { ReaderState } from '../src/types';
import type { BookCacheIndex } from '../src/types/m2Contracts';
import type { ProcessedDocument } from '../src/types/processedDocument';

const bookIndex: BookCacheIndex = {
	docKey: 'books-sample-epub',
	sourcePath: 'books/sample.epub',
	sourceChecksum: 'checksum-a',
	title: 'Sample',
	totalWordCount: 100,
	chapters: [
		{ chapterId: 'chapter-01', title: 'One', wordCount: 40, words: [] },
		{ chapterId: 'chapter-02', title: 'Two', wordCount: 60, words: [] }
	],
	parsedAt: '2026-05-21T00:00:00.000Z'
};

const noteProcessed: ProcessedDocument = {
	kind: 'sections',
	processorId: 'sections',
	meta: {
		sourcePath: 'notes/foo.md',
		sourceChecksum: 'note-checksum',
		processedAt: '2026-05-21T00:00:00.000Z',
		model: 'deterministic',
		prepareStrategy: 'single'
	},
	sections: [
		{
			sectionId: 'intro',
			title: 'Intro',
			stream: [
				{ kind: 'word', text: 'one' },
				{ kind: 'word', text: 'two' },
				{ kind: 'word', text: 'three' },
				{ kind: 'word', text: 'four' }
			]
		},
		{
			sectionId: 'body',
			title: 'Body',
			stream: [
				{ kind: 'word', text: 'five' },
				{ kind: 'word', text: 'six' }
			]
		}
	]
};

const aiNoteProcessed: ProcessedDocument = {
	kind: 'sections',
	processorId: 'sections',
	meta: {
		sourcePath: 'notes/foo.md',
		sourceChecksum: 'note-checksum',
		processedAt: '2026-05-21T00:00:00.000Z',
		model: 'gpt-test',
		prepareStrategy: 'batch'
	},
	sections: [
		{
			sectionId: '01-intro',
			title: 'Intro',
			stream: [
				{ kind: 'word', text: 'alpha' },
				{ kind: 'word', text: 'beta' }
			]
		},
		{
			sectionId: '03-background',
			title: 'Background',
			stream: [
				{ kind: 'word', text: 'gamma' },
				{ kind: 'word', text: 'delta' },
				{ kind: 'word', text: 'epsilon' }
			]
		}
	]
};

const singleStoryProcessed: ProcessedDocument = {
	kind: 'single_story',
	processorId: 'single_story',
	meta: {
		sourcePath: 'notes/foo.md',
		sourceChecksum: 'note-checksum',
		processedAt: '2026-05-21T00:00:00.000Z',
		model: 'gpt-test',
		prepareStrategy: 'single'
	},
	stream: [
		{ kind: 'word', text: 'once' },
		{ kind: 'word', text: 'upon' },
		{ kind: 'word', text: 'a' },
		{ kind: 'word', text: 'time' }
	]
};

describe('readingProgress', () => {
	it('computes book progress from chapter offsets', () => {
		expect(bookProgressPercent(bookIndex, { chapterId: 'chapter-01', wordIndex: 20 })).toBe(20);
		expect(bookProgressPercent(bookIndex, { chapterId: 'chapter-02', wordIndex: 30 })).toBe(70);
	});

	it('computes note progress across sections', () => {
		expect(noteProgressPercent(noteProcessed, { sectionId: 'intro', wordIndex: 2 })).toBeCloseTo(33.33, 1);
		expect(noteProgressPercent(noteProcessed, { sectionId: 'body', wordIndex: 1 })).toBeCloseTo(83.33, 1);
	});

	it('marks finished at or above 95%', () => {
		expect(statusFromProgressPercent(94.9)).toBe('in_progress');
		expect(statusFromProgressPercent(95)).toBe('finished');
	});

	it('detects checksum mismatch for reset', () => {
		expect(shouldResetReadingState('old', 'new')).toBe(true);
		expect(shouldResetReadingState(undefined, 'new')).toBe(false);
		expect(shouldResetReadingState('same', 'same')).toBe(false);
	});

	it('maps note positions to engine indices and back', () => {
		const position = { sectionId: 'body', wordIndex: 1 };
		const restored = notePositionFromReadingState(noteProcessed, position);
		const indices = notePositionToEngineIndices(noteProcessed, restored);
		expect(indices.sectionIndex).toBe(1);
		expect(indices.tokenIndex).toBeGreaterThanOrEqual(0);
	});

	it('returns default note position for missing section', () => {
		expect(defaultNotePosition(noteProcessed)).toEqual({ sectionId: 'intro', wordIndex: 0 });
	});

	it('restores single_story position against a story processed doc', () => {
		const position = { sectionId: 'single_story', wordIndex: 2 };
		expect(notePositionFromReadingState(singleStoryProcessed, position)).toEqual(position);
		const indices = notePositionToEngineIndices(singleStoryProcessed, position);
		expect(indices.sectionIndex).toBe(0);
		expect(indices.tokenIndex).toBeGreaterThanOrEqual(0);
	});

	it('clamps single_story wordIndex to stream length', () => {
		const position = { sectionId: 'single_story', wordIndex: 99 };
		expect(notePositionFromReadingState(singleStoryProcessed, position)).toEqual({
			sectionId: 'single_story',
			wordIndex: 3
		});
	});

	it('restores AI section IDs when loaded doc matches', () => {
		const position = { sectionId: '03-background', wordIndex: 1 };
		const restored = notePositionFromReadingState(aiNoteProcessed, position);
		expect(restored).toEqual(position);
		const indices = notePositionToEngineIndices(aiNoteProcessed, restored);
		expect(indices.sectionIndex).toBe(1);
	});

	it('falls back when AI section ID is absent from deterministic doc', () => {
		const position = { sectionId: '03-background', wordIndex: 1 };
		expect(notePositionFromReadingState(noteProcessed, position)).toEqual({
			sectionId: 'intro',
			wordIndex: 0
		});
	});

	it('falls back when saved single_story but loaded sections doc', () => {
		const position = { sectionId: 'single_story', wordIndex: 2 };
		expect(notePositionFromReadingState(noteProcessed, position)).toEqual({
			sectionId: 'intro',
			wordIndex: 0
		});
	});

	it('falls back to story start when saved sections ID but loaded single_story', () => {
		const position = { sectionId: 'body', wordIndex: 1 };
		expect(notePositionFromReadingState(singleStoryProcessed, position)).toEqual({
			sectionId: 'single_story',
			wordIndex: 0
		});
	});

	it('computeDocumentProgressFromEngine uses full note position across sections', () => {
		const engine = {
			getLoadedProcessedDocument: () => noteProcessed,
			getSectionList: () => [
				{ id: 'intro', title: 'Intro' },
				{ id: 'body', title: 'Body' }
			]
		};
		const state = {
			currentSectionIndex: 1,
			currentTokenIndex: 1,
			currentIndex: 1,
			totalWords: 4,
			totalTokens: 4
		} as ReaderState;
		expect(
			computeDocumentProgressFromEngine({
				sourceKind: 'note',
				engine,
				state
			})
		).toBeCloseTo(83.33, 1);
	});

	it('computeDocumentProgressFromEngine falls back to loaded chunk when no processed doc', () => {
		const engine = {
			getLoadedProcessedDocument: () => null,
			getSectionList: () => []
		};
		const state = {
			currentIndex: 25,
			totalWords: 100,
			currentTokenIndex: 25,
			totalTokens: 100
		} as ReaderState;
		expect(
			computeDocumentProgressFromEngine({
				sourceKind: 'note',
				engine,
				state
			})
		).toBe(25);
	});
});
