import { describe, expect, it } from 'vitest';
import { mergeReadingStateFiles } from '../src/store/readingStateMerge';
import type { ReadingState, ReadingStateFile } from '../src/types/m2Contracts';

const sampleState = (
	sourcePath: string,
	lastOpenedAt: string,
	wordIndex: number
): ReadingState => ({
	sourcePath,
	sourceKind: 'book',
	title: 'Sample',
	folder: 'books',
	sourceChecksum: 'abc123',
	lastOpenedAt,
	pinned: false,
	status: 'in_progress',
	playbackMode: 'rsvp',
	position: { chapterId: 'chapter-01', wordIndex },
	progressPercent: 4
});

describe('mergeReadingStateFiles', () => {
	it('prefers newer lastOpenedAt per source', () => {
		const local: ReadingStateFile = {
			lastGlobalSourcePath: 'books/a.epub',
			sources: {
				'books/a.epub': sampleState('books/a.epub', '2026-05-23T00:00:00.000Z', 42)
			}
		};
		const disk: ReadingStateFile = {
			lastGlobalSourcePath: 'books/a.epub',
			sources: {
				'books/a.epub': sampleState('books/a.epub', '2026-05-21T00:00:00.000Z', 12)
			}
		};

		const { merged, localHadNewer } = mergeReadingStateFiles(local, disk);
		expect(merged.sources['books/a.epub']?.position.wordIndex).toBe(42);
		expect(localHadNewer).toBe(true);
	});

	it('keeps disk-only sources when merging dirty local state', () => {
		const local: ReadingStateFile = {
			lastGlobalSourcePath: 'books/a.epub',
			sources: {
				'books/a.epub': sampleState('books/a.epub', '2026-05-21T00:00:00.000Z', 12)
			}
		};
		const disk: ReadingStateFile = {
			lastGlobalSourcePath: 'books/b.epub',
			sources: {
				'books/b.epub': sampleState('books/b.epub', '2026-05-22T00:00:00.000Z', 99)
			}
		};

		const { merged } = mergeReadingStateFiles(local, disk);
		expect(merged.sources['books/a.epub']?.position.wordIndex).toBe(12);
		expect(merged.sources['books/b.epub']?.position.wordIndex).toBe(99);
		expect(merged.lastGlobalSourcePath).toBe('books/b.epub');
	});
});
