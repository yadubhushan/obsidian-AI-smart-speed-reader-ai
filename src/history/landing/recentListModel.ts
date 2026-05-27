import type { ManifestStore } from '../../store/ManifestStore';
import type { PluginServices } from '../../services/serviceRegistry';
import type { BookPosition, NotePosition, ReadingStatus } from '../../types/m2Contracts';
import {
	buildBookHistoryModel,
	buildNoteHistoryModel,
	type BookHistoryRow,
	type NoteHistoryRow
} from '../historyListModel';

export const RECENT_LIST_LIMIT = 10;

export interface RecentHistoryRow {
	sourcePath: string;
	sourceKind: 'book' | 'note';
	title: string;
	subtitle: string;
	status: ReadingStatus;
	progressPercent: number;
	lastOpenedAt?: string;
	docKey: string;
	pinned: boolean;
	pinnedAt?: string;
	initialPosition: BookPosition | NotePosition;
	playbackMode?: string;
}

function bookRowToRecent(row: BookHistoryRow): RecentHistoryRow {
	const state = row.author ? `Book · ${row.author}` : 'Book';
	return {
		sourcePath: row.sourcePath,
		sourceKind: 'book',
		title: row.title,
		subtitle: state,
		status: row.status,
		progressPercent: row.progressPercent,
		lastOpenedAt: row.lastOpenedAt,
		docKey: row.docKey,
		pinned: row.pinned,
		pinnedAt: row.pinnedAt,
		initialPosition: { chapterId: 'c1', wordIndex: 0 }
	};
}

function noteRowToRecent(row: NoteHistoryRow): RecentHistoryRow {
	const badgeLabel = row.badge === 'ai' ? 'AI ready' : 'Deterministic';
	return {
		sourcePath: row.sourcePath,
		sourceKind: 'note',
		title: row.title,
		subtitle: `Notes · ${badgeLabel}`,
		status: row.status,
		progressPercent: row.progressPercent,
		lastOpenedAt: row.lastOpenedAt,
		docKey: row.docKey,
		pinned: row.pinned,
		pinnedAt: row.pinnedAt,
		initialPosition: row.position
	};
}

function sortRecentRows(rows: RecentHistoryRow[]): RecentHistoryRow[] {
	return [...rows].sort((a, b) => {
		if (a.pinned !== b.pinned) {
			return a.pinned ? -1 : 1;
		}
		if (a.pinned && b.pinned) {
			const aTime = a.pinnedAt ? Date.parse(a.pinnedAt) : 0;
			const bTime = b.pinnedAt ? Date.parse(b.pinnedAt) : 0;
			if (aTime !== bTime) {
				return bTime - aTime;
			}
		}
		const aTime = a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : 0;
		const bTime = b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : 0;
		return bTime - aTime;
	});
}

export function mergeRecentRows(
	bookRows: BookHistoryRow[],
	noteRows: NoteHistoryRow[],
	getReadingState: PluginServices['readingStateStore']['get']
): RecentHistoryRow[] {
	const merged: RecentHistoryRow[] = [
		...bookRows.map(bookRowToRecent),
		...noteRows.map(noteRowToRecent)
	];

	const enriched = merged.map((row) => {
		const state = getReadingState(row.sourcePath);
		if (!state) {
			return row;
		}
		return {
			...row,
			status: state.status,
			initialPosition: state.position as BookPosition | NotePosition,
			playbackMode: state.playbackMode,
			pinned: state.pinned,
			pinnedAt: state.pinnedAt,
			progressPercent: state.progressPercent,
			lastOpenedAt: state.lastOpenedAt ?? row.lastOpenedAt
		};
	});

	return sortRecentRows(enriched);
}

export function limitRecentRows(rows: RecentHistoryRow[], limit = RECENT_LIST_LIMIT): RecentHistoryRow[] {
	return rows.slice(0, limit);
}

export interface BuildRecentListInput {
	services: PluginServices;
	getManifestStore: () => ManifestStore;
}

export async function buildRecentList(input: BuildRecentListInput): Promise<RecentHistoryRow[]> {
	const { services, getManifestStore } = input;
	const file = await services.readingStateStore.load();
	const entries = services.epubVaultIndex.getAll();

	const bookModel = await buildBookHistoryModel({
		entries,
		getReadingState: (path) => services.readingStateStore.get(path),
		getCachedIndex: (docKey) => services.bookCacheStore.get(docKey)
	});

	const noteRows = await buildNoteHistoryModel(file, (sourcePath) =>
		getManifestStore().getDocumentIndex(sourcePath)
	);

	const startedBooks = bookModel.main.filter(
		(row) => row.status === 'in_progress' || row.status === 'finished'
	);

	const merged = mergeRecentRows(startedBooks, noteRows, (path) =>
		services.readingStateStore.get(path)
	);

	return limitRecentRows(merged);
}
