import { describe, expect, it } from 'vitest';
import {
	limitRecentRows,
	mergeRecentRows,
	RECENT_LIST_LIMIT,
	type RecentHistoryRow
} from '../src/history/landing/recentListModel';
import type { BookHistoryRow, NoteHistoryRow } from '../src/history/historyListModel';

function bookRow(overrides: Partial<BookHistoryRow> = {}): BookHistoryRow {
	return {
		sourcePath: 'books/sample.epub',
		title: 'Sample Book',
		author: 'Author',
		folder: 'books',
		status: 'in_progress',
		progressPercent: 40,
		lastOpenedAt: '2026-05-20T10:00:00.000Z',
		pinned: false,
		docKey: 'book-key',
		section: 'main',
		...overrides
	};
}

function noteRow(overrides: Partial<NoteHistoryRow> = {}): NoteHistoryRow {
	return {
		sourcePath: 'notes/sample.md',
		title: 'Sample Note',
		folder: 'notes',
		status: 'in_progress',
		progressPercent: 55,
		lastOpenedAt: '2026-05-21T10:00:00.000Z',
		pinned: false,
		docKey: 'note-key',
		badge: 'deterministic',
		position: { sectionId: 's1', wordIndex: 0 },
		...overrides
	};
}

describe('recentListModel', () => {
	it('merges book and note rows into unified recent rows', () => {
		const merged = mergeRecentRows(
			[bookRow()],
			[noteRow()],
			() => undefined
		);

		expect(merged).toHaveLength(2);
		expect(merged.map((row) => row.sourceKind).sort()).toEqual(['book', 'note']);
	});

	it('sorts pinned first then by lastOpenedAt desc', () => {
		const merged = mergeRecentRows(
			[
				bookRow({
					sourcePath: 'books/old.epub',
					title: 'Old Book',
					lastOpenedAt: '2026-05-10T10:00:00.000Z',
					pinned: true,
					pinnedAt: '2026-05-10T12:00:00.000Z'
				})
			],
			[
				noteRow({
					sourcePath: 'notes/new.md',
					title: 'New Note',
					lastOpenedAt: '2026-05-22T10:00:00.000Z'
				})
			],
			() => undefined
		);

		expect(merged[0]?.sourcePath).toBe('books/old.epub');
		expect(merged[1]?.sourcePath).toBe('notes/new.md');
	});

	it('enriches rows from reading state store', () => {
		const merged = mergeRecentRows([bookRow()], [], (path) =>
			path === 'books/sample.epub'
				? {
						sourcePath: path,
						sourceKind: 'book',
						title: 'Sample Book',
						folder: 'books',
						sourceChecksum: 'abc',
						status: 'in_progress',
						playbackMode: 'rsvp',
						position: { chapterId: 'c2', wordIndex: 12 },
						progressPercent: 72,
						lastOpenedAt: '2026-05-23T10:00:00.000Z',
						pinned: true,
						pinnedAt: '2026-05-23T11:00:00.000Z'
					}
				: undefined
		);

		expect(merged[0]?.progressPercent).toBe(72);
		expect(merged[0]?.pinned).toBe(true);
		expect(merged[0]?.initialPosition).toEqual({ chapterId: 'c2', wordIndex: 12 });
	});

	it('caps recent rows at RECENT_LIST_LIMIT', () => {
		const rows: RecentHistoryRow[] = Array.from({ length: 15 }, (_, index) => ({
			sourcePath: `books/${index}.epub`,
			sourceKind: 'book' as const,
			title: `Book ${index}`,
			subtitle: 'Book',
			status: 'in_progress' as const,
			progressPercent: 10,
			docKey: `key-${index}`,
			pinned: false,
			initialPosition: { chapterId: 'c1', wordIndex: 0 }
		}));

		expect(limitRecentRows(rows)).toHaveLength(RECENT_LIST_LIMIT);
	});
});
