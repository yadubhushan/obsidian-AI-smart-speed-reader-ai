import { describe, expect, it } from 'vitest';
import {
	buildNoteHistoryModel,
	noteBadgeFromIndex,
	type NoteHistoryRow
} from '../src/history/historyListModel';
import type { DocumentCacheIndex } from '../src/types/processedDocument';
import type { ReadingState, ReadingStateFile } from '../src/types/m2Contracts';

function noteState(sourcePath: string, overrides: Partial<ReadingState> = {}): ReadingState {
	return {
		sourcePath,
		sourceKind: 'note',
		title: overrides.title ?? sourcePath,
		folder: overrides.folder ?? 'notes',
		sourceChecksum: 'abc',
		lastOpenedAt: overrides.lastOpenedAt ?? '2026-05-20T10:00:00.000Z',
		pinned: overrides.pinned ?? false,
		status: overrides.status ?? 'in_progress',
		playbackMode: 'rsvp',
		position: { sectionId: 'intro', wordIndex: 4 },
		progressPercent: overrides.progressPercent ?? 25,
		...overrides
	};
}

describe('historyListModel notes', () => {
	it('includes only note kind with in_progress or finished', async () => {
		const file: ReadingStateFile = {
			lastGlobalSourcePath: 'notes/active.md',
			sources: {
				'notes/active.md': noteState('notes/active.md', { title: 'Active Note' }),
				'books/half.epub': noteState('books/half.epub', {
					sourceKind: 'book',
					status: 'in_progress'
				}),
				'notes/draft.md': noteState('notes/draft.md', {
					status: 'unread'
				}),
				'notes/done.md': noteState('notes/done.md', {
					title: 'Done Note',
					status: 'finished',
					progressPercent: 100
				})
			}
		};

		const rows = await buildNoteHistoryModel(file, async () => null);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.sourcePath).sort()).toEqual([
			'notes/active.md',
			'notes/done.md'
		]);
	});

	it('derives AI ready vs Deterministic badge from manifest index', () => {
		const readyIndex: DocumentCacheIndex = {
			version: 1,
			sourcePath: 'notes/ready.md',
			sourceChecksum: 'x',
			activeProcessingMode: 'sections',
			modes: {
				sections: { status: 'ready' },
				single_story: { status: 'none' }
			},
			updatedAt: '2026-05-01T00:00:00.000Z'
		};
		const staleIndex: DocumentCacheIndex = {
			...readyIndex,
			modes: {
				sections: { status: 'stale' },
				single_story: { status: 'none' }
			}
		};

		expect(noteBadgeFromIndex(readyIndex)).toBe('ai');
		expect(noteBadgeFromIndex(staleIndex)).toBe('deterministic');
		expect(noteBadgeFromIndex(null)).toBe('deterministic');
	});

	it('maps note row fields from reading state', async () => {
		const file: ReadingStateFile = {
			lastGlobalSourcePath: '',
			sources: {
				'notes/pinned.md': noteState('notes/pinned.md', {
					title: 'Pinned',
					pinned: true,
					pinnedAt: '2026-05-19T08:00:00.000Z',
					progressPercent: 55
				})
			}
		};

		const rows = await buildNoteHistoryModel(file, async () => null);
		const row = rows[0] as NoteHistoryRow;
		expect(row.title).toBe('Pinned');
		expect(row.pinned).toBe(true);
		expect(row.badge).toBe('deterministic');
		expect(row.position).toEqual({ sectionId: 'intro', wordIndex: 4 });
		expect(row.progressPercent).toBe(55);
	});
});
