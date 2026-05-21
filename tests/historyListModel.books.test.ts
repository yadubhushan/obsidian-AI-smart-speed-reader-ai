import { describe, expect, it } from 'vitest';
import {
	buildBookHistoryModel,
	filterBookRowsBySearch,
	groupBookRowsByFolder,
	sortBookRows,
	type BookHistoryRow
} from '../src/history/historyListModel';
import type { EpubVaultEntry, ReadingState } from '../src/types/m2Contracts';

const entries: EpubVaultEntry[] = [
	{ sourcePath: 'books/unread.epub', title: 'unread', folder: 'books' },
	{ sourcePath: 'books/half.epub', title: 'half', folder: 'books' },
	{ sourcePath: 'archive/done.epub', title: 'done', folder: 'archive' }
];

function bookState(
	sourcePath: string,
	overrides: Partial<ReadingState>
): ReadingState {
	return {
		sourcePath,
		sourceKind: 'book',
		title: overrides.title ?? sourcePath,
		folder: overrides.folder ?? 'books',
		sourceChecksum: 'abc',
		lastOpenedAt: overrides.lastOpenedAt ?? '2026-05-01T12:00:00.000Z',
		pinned: false,
		status: overrides.status ?? 'in_progress',
		playbackMode: 'rsvp',
		position: { chapterId: 'c1', wordIndex: 0 },
		progressPercent: overrides.progressPercent ?? 0,
		...overrides
	};
}

describe('historyListModel books', () => {
	it('merges unread, in_progress, and finished sections', async () => {
		const states: Record<string, ReadingState> = {
			'books/half.epub': bookState('books/half.epub', {
				title: 'Half Read',
				status: 'in_progress',
				progressPercent: 42,
				lastOpenedAt: '2026-05-20T10:00:00.000Z'
			}),
			'archive/done.epub': bookState('archive/done.epub', {
				title: 'Finished Book',
				folder: 'archive',
				status: 'finished',
				progressPercent: 100,
				lastOpenedAt: '2026-05-19T10:00:00.000Z'
			})
		};

		const model = await buildBookHistoryModel({
			entries,
			getReadingState: (path) => states[path],
			getCachedIndex: async () => null
		});

		expect(model.unread).toHaveLength(1);
		expect(model.unread[0]?.sourcePath).toBe('books/unread.epub');
		expect(model.unread[0]?.section).toBe('unread');

		expect(model.main).toHaveLength(2);
		expect(model.main.map((row) => row.sourcePath).sort()).toEqual([
			'archive/done.epub',
			'books/half.epub'
		]);
		expect(model.main.find((row) => row.sourcePath === 'books/half.epub')?.progressPercent).toBe(
			42
		);
	});

	it('sorts by last read, title, and progress', () => {
		const rows: BookHistoryRow[] = [
			{
				sourcePath: 'a.epub',
				title: 'Zebra',
				folder: 'books',
				status: 'in_progress',
				progressPercent: 10,
				lastOpenedAt: '2026-05-01T00:00:00.000Z',
				pinned: false,
				docKey: 'a',
				section: 'main'
			},
			{
				sourcePath: 'b.epub',
				title: 'Alpha',
				folder: 'books',
				status: 'finished',
				progressPercent: 90,
				lastOpenedAt: '2026-05-10T00:00:00.000Z',
				pinned: false,
				docKey: 'b',
				section: 'main'
			}
		];

		expect(sortBookRows(rows, 'title').map((row) => row.title)).toEqual(['Alpha', 'Zebra']);
		expect(sortBookRows(rows, 'progress').map((row) => row.title)).toEqual(['Alpha', 'Zebra']);
		expect(sortBookRows(rows, 'lastRead').map((row) => row.title)).toEqual(['Alpha', 'Zebra']);
	});

	it('filters rows by search query on title or path', () => {
		const rows: BookHistoryRow[] = [
			{
				sourcePath: 'books/secret.epub',
				title: 'Hidden',
				folder: 'books',
				status: 'unread',
				progressPercent: 0,
				pinned: false,
				docKey: 'x',
				section: 'unread'
			},
			{
				sourcePath: 'books/visible.epub',
				title: 'Visible Title',
				folder: 'books',
				status: 'unread',
				progressPercent: 0,
				pinned: false,
				docKey: 'y',
				section: 'unread'
			}
		];

		expect(filterBookRowsBySearch(rows, 'visible').map((row) => row.title)).toEqual([
			'Visible Title'
		]);
		expect(filterBookRowsBySearch(rows, 'secret.epub').map((row) => row.title)).toEqual([
			'Hidden'
		]);
	});

	it('groups rows by vault folder', () => {
		const rows: BookHistoryRow[] = [
			{
				sourcePath: 'a.epub',
				title: 'A',
				folder: 'books',
				status: 'unread',
				progressPercent: 0,
				pinned: false,
				docKey: 'a',
				section: 'unread'
			},
			{
				sourcePath: 'b.epub',
				title: 'B',
				folder: 'archive',
				status: 'unread',
				progressPercent: 0,
				pinned: false,
				docKey: 'b',
				section: 'unread'
			}
		];

		const groups = groupBookRowsByFolder(rows);
		expect(groups).toHaveLength(2);
		expect(groups[0]?.folder).toBe('archive');
		expect(groups[1]?.folder).toBe('books');
	});
});
