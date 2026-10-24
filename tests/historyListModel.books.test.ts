import { describe, expect, it } from 'vitest';
import {
	buildBookDashboardSections,
	buildBookHistoryModel,
	filterBookRowsBySearch,
	groupBookRowsByFolder,
	sortBookRows,
	type BookHistoryRow
} from '../src/history/historyListModel';
import { docKeyFromSourcePath } from '../src/store/docKey';
import type { BookCacheIndex, EpubVaultEntry, ReadingState } from '../src/types/m2Contracts';

const docKeyFor = docKeyFromSourcePath;

function cachedIndex(sourcePath: string, title: string, author?: string): BookCacheIndex {
	return {
		docKey: docKeyFromSourcePath(sourcePath),
		sourcePath,
		sourceChecksum: 'x',
		title,
		author,
		totalWordCount: 0,
		chapters: [],
		parsedAt: '2026-01-01T00:00:00.000Z'
	};
}

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
				section: 'main',
				typeLabel: 'Book',
				lengthLabel: '10 chapters',
				lastReadLabel: 'Last read 2 days ago',
				progressLabel: '10% complete',
				surfaceKind: 'book',
				isContinueTarget: false
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
				section: 'main',
				typeLabel: 'Book',
				lengthLabel: '12 chapters',
				lastReadLabel: 'Last read yesterday',
				progressLabel: '90% complete',
				surfaceKind: 'book',
				isContinueTarget: false
			}
		];

		expect(sortBookRows(rows, 'title').map((row) => row.title)).toEqual(['Alpha', 'Zebra']);
		expect(sortBookRows(rows, 'progress').map((row) => row.title)).toEqual(['Alpha', 'Zebra']);
		expect(sortBookRows(rows, 'lastRead').map((row) => row.title)).toEqual(['Alpha', 'Zebra']);
	});

	it('filters rows by search query on visible metadata only', () => {
		const rows: BookHistoryRow[] = [
			{
				sourcePath: 'books/secret.epub',
				title: 'Hidden',
				folder: 'books',
				status: 'unread',
				progressPercent: 0,
				pinned: false,
				docKey: 'x',
				section: 'unread',
				typeLabel: 'Book',
				lengthLabel: '12 chapters',
				lastReadLabel: 'Not started yet',
				progressLabel: '0% complete',
				surfaceKind: 'book',
				isContinueTarget: false
			},
			{
				sourcePath: 'books/visible.epub',
				title: 'Visible Title',
				folder: 'books',
				status: 'unread',
				progressPercent: 0,
				pinned: false,
				docKey: 'y',
				section: 'unread',
				typeLabel: 'Book',
				lengthLabel: '5 chapters',
				lastReadLabel: 'Not started yet',
				progressLabel: '0% complete',
				surfaceKind: 'book',
				isContinueTarget: false
			}
		];

		expect(filterBookRowsBySearch(rows, 'visible').map((row) => row.title)).toEqual([
			'Visible Title'
		]);
		expect(filterBookRowsBySearch(rows, '12 chapters').map((row) => row.title)).toEqual([
			'Hidden'
		]);
		expect(filterBookRowsBySearch(rows, 'secret.epub')).toEqual([]);
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
				section: 'unread',
				typeLabel: 'Book',
				lengthLabel: '3 chapters',
				lastReadLabel: 'Not started yet',
				progressLabel: '0% complete',
				surfaceKind: 'book',
				isContinueTarget: false
			},
			{
				sourcePath: 'b.epub',
				title: 'B',
				folder: 'archive',
				status: 'unread',
				progressPercent: 0,
				pinned: false,
				docKey: 'b',
				section: 'unread',
				typeLabel: 'Book',
				lengthLabel: '1 chapter',
				lastReadLabel: 'Not started yet',
				progressLabel: '0% complete',
				surfaceKind: 'book',
				isContinueTarget: false
			}
		];

		const groups = groupBookRowsByFolder(rows);
		expect(groups).toHaveLength(2);
		expect(groups[0]?.folder).toBe('archive');
		expect(groups[1]?.folder).toBe('books');
	});

	it('builds pinned, in-progress, up-next, and finished dashboard shelves', async () => {
		const states: Record<string, ReadingState> = {
			'books/half.epub': bookState('books/half.epub', {
				title: 'Half Read',
				status: 'in_progress',
				progressPercent: 42,
				pinned: true,
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

		const sections = buildBookDashboardSections(model, {
			inProgress: true,
			pinned: true,
			upNext: true,
			finished: true
		}, '');

		expect(sections.map((section) => section.title)).toEqual([
			'Pinned',
			'Up next',
			'Finished'
		]);
		expect(sections[0]?.rows.map((row) => row.title)).toEqual(['Half Read']);
		expect(sections[1]?.rows.map((row) => row.title)).toEqual(['unread']);
		expect(sections[2]?.rows.map((row) => row.title)).toEqual(['Finished Book']);
	});

	it('prefers a user rename, then EPUB metadata, then a cleaned filename', async () => {
		const model = await buildBookHistoryModel({
			entries: [
				{ sourcePath: 'a/Siddhartha (Hermann Hesse).epub', title: 'Siddhartha (Hermann Hesse)', folder: 'a' },
				{ sourcePath: 'a/meta.epub', title: 'meta', folder: 'a' },
				{ sourcePath: 'a/renamed.epub', title: 'renamed', folder: 'a' }
			],
			getReadingState: (path) =>
				path === 'a/renamed.epub'
					? bookState(path, { title: 'Long Metadata Title: With Subtitle', author: 'Meta Author' })
					: undefined,
			getCachedIndex: async (docKey) =>
				docKey.length > 0 && docKey === docKeyFor('a/meta.epub')
					? cachedIndex('a/meta.epub', 'Meta Title z-library.sk, 1lib.sk', 'Cached Author')
					: null,
			getDisplayOverride: (path) =>
				path === 'a/renamed.epub' ? { title: 'Short', updatedAt: '2026-10-24T00:00:00.000Z' } : undefined
		});
		const byPath = new Map([...model.main, ...model.unread].map((row) => [row.sourcePath, row]));

		expect(byPath.get('a/Siddhartha (Hermann Hesse).epub')).toMatchObject({
			title: 'Siddhartha',
			author: 'Hermann Hesse',
			hasCustomTitle: false
		});
		expect(byPath.get('a/meta.epub')).toMatchObject({ title: 'Meta Title', author: 'Cached Author' });
		expect(byPath.get('a/renamed.epub')).toMatchObject({
			title: 'Short',
			author: 'Meta Author',
			originalTitle: 'Long Metadata Title: With Subtitle',
			hasCustomTitle: true
		});
	});

	it('collapses duplicate copies and keeps the one with reading history', async () => {
		const model = await buildBookHistoryModel({
			entries: [
				{ sourcePath: 'books/Siddhartha.epub', title: 'Siddhartha', folder: 'books' },
				{ sourcePath: 'books/epub/Siddhartha (Hermann Hesse).epub', title: 'Siddhartha (Hermann Hesse)', folder: 'books/epub' },
				{ sourcePath: 'old/Siddhartha.epub', title: 'Siddhartha', folder: 'old' }
			],
			getReadingState: (path) =>
				path === 'books/epub/Siddhartha (Hermann Hesse).epub'
					? bookState(path, { title: 'Siddhartha', progressPercent: 12 })
					: undefined,
			getCachedIndex: async () => null,
			isInVault: (path) => path !== 'old/Siddhartha.epub'
		});

		expect(model.main.map((row) => row.sourcePath)).toEqual(['books/epub/Siddhartha (Hermann Hesse).epub']);
		expect(model.unread).toEqual([]);
	});

	it('hides Up next when that filter is off', async () => {
		const model = await buildBookHistoryModel({
			entries,
			getReadingState: () => undefined,
			getCachedIndex: async () => null
		});
		const sections = buildBookDashboardSections(
			model,
			{ inProgress: true, pinned: true, upNext: false, finished: true },
			''
		);
		expect(sections).toEqual([]);
	});
});

