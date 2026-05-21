import { docKeyFromSourcePath } from '../store/docKey';
import type { DocumentCacheIndex } from '../types/processedDocument';
import type {
	BookCacheIndex,
	EpubVaultEntry,
	NotePosition,
	ReadingState,
	ReadingStateFile,
	ReadingStatus
} from '../types/m2Contracts';
import type { HistoryRowFilterable } from './historyFilters';

export type BookSortMode = 'lastRead' | 'title' | 'progress';
export type NotePlaybackBadge = 'ai' | 'deterministic';

export interface BookHistoryRow extends HistoryRowFilterable {
	sourcePath: string;
	title: string;
	author?: string;
	folder: string;
	status: ReadingStatus;
	progressPercent: number;
	lastOpenedAt?: string;
	pinned: boolean;
	pinnedAt?: string;
	docKey: string;
	section: 'main' | 'unread';
}

export interface NoteHistoryRow extends HistoryRowFilterable {
	sourcePath: string;
	title: string;
	folder: string;
	status: ReadingStatus;
	progressPercent: number;
	lastOpenedAt?: string;
	pinned: boolean;
	pinnedAt?: string;
	docKey: string;
	badge: NotePlaybackBadge;
	position: NotePosition;
}

export interface BookHistoryModel {
	main: BookHistoryRow[];
	unread: BookHistoryRow[];
}

export interface BuildBookHistoryModelInput {
	entries: EpubVaultEntry[];
	getReadingState: (sourcePath: string) => ReadingState | undefined;
	getCachedIndex: (docKey: string) => Promise<BookCacheIndex | null>;
}

function resolveTitle(
	entry: EpubVaultEntry,
	state: ReadingState | undefined,
	cached: BookCacheIndex | null
): string {
	return state?.title ?? cached?.title ?? entry.title;
}

function resolveAuthor(
	state: ReadingState | undefined,
	cached: BookCacheIndex | null
): string | undefined {
	return state?.author ?? cached?.author;
}

function buildRow(
	entry: EpubVaultEntry,
	state: ReadingState | undefined,
	cached: BookCacheIndex | null,
	section: 'main' | 'unread'
): BookHistoryRow {
	const docKey = docKeyFromSourcePath(entry.sourcePath);
	return {
		sourcePath: entry.sourcePath,
		title: resolveTitle(entry, state, cached),
		author: resolveAuthor(state, cached),
		folder: state?.folder ?? entry.folder,
		status: state?.status ?? 'unread',
		progressPercent: state?.progressPercent ?? 0,
		lastOpenedAt: state?.lastOpenedAt,
		pinned: state?.pinned ?? false,
		pinnedAt: state?.pinnedAt,
		docKey,
		section
	};
}

export function noteBadgeFromIndex(index: DocumentCacheIndex | null): NotePlaybackBadge {
	if (!index) {
		return 'deterministic';
	}
	const activeMode = index.activeProcessingMode;
	return index.modes[activeMode]?.status === 'ready' ? 'ai' : 'deterministic';
}

export function buildNoteHistoryModel(
	file: ReadingStateFile,
	getManifestIndex: (sourcePath: string) => Promise<DocumentCacheIndex | null>
): Promise<NoteHistoryRow[]> {
	const noteStates = Object.values(file.sources).filter(
		(state) =>
			state.sourceKind === 'note' &&
			(state.status === 'in_progress' || state.status === 'finished')
	);

	return Promise.all(
		noteStates.map(async (state) => {
			const index = await getManifestIndex(state.sourcePath);
			const position = state.position as NotePosition;
			return {
				sourcePath: state.sourcePath,
				title: state.title,
				folder: state.folder,
				status: state.status,
				progressPercent: state.progressPercent,
				lastOpenedAt: state.lastOpenedAt,
				pinned: state.pinned,
				pinnedAt: state.pinnedAt,
				docKey: docKeyFromSourcePath(state.sourcePath),
				badge: noteBadgeFromIndex(index),
				position
			};
		})
	);
}

export async function buildBookHistoryModel(
	input: BuildBookHistoryModelInput
): Promise<BookHistoryModel> {
	const main: BookHistoryRow[] = [];
	const unread: BookHistoryRow[] = [];

	for (const entry of input.entries) {
		const state = input.getReadingState(entry.sourcePath);
		const docKey = docKeyFromSourcePath(entry.sourcePath);
		const cached = await input.getCachedIndex(docKey);

		if (!state || state.status === 'unread') {
			unread.push(buildRow(entry, state, cached, 'unread'));
			continue;
		}

		if (state.sourceKind !== 'book') {
			continue;
		}

		if (state.status === 'in_progress' || state.status === 'finished') {
			main.push(buildRow(entry, state, cached, 'main'));
		}
	}

	return { main, unread };
}

export function sortNoteRows(rows: NoteHistoryRow[], mode: BookSortMode): NoteHistoryRow[] {
	const sorted = [...rows];
	switch (mode) {
		case 'title':
			sorted.sort((a, b) => a.title.localeCompare(b.title));
			break;
		case 'progress':
			sorted.sort((a, b) => b.progressPercent - a.progressPercent);
			break;
		case 'lastRead':
		default:
			sorted.sort((a, b) => {
				const aTime = a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : 0;
				const bTime = b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : 0;
				return bTime - aTime;
			});
			break;
	}
	return sorted;
}

export function filterNoteRowsBySearch(rows: NoteHistoryRow[], query: string): NoteHistoryRow[] {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) {
		return rows;
	}
	return rows.filter(
		(row) =>
			row.title.toLowerCase().includes(trimmed) ||
			row.sourcePath.toLowerCase().includes(trimmed)
	);
}

export interface NoteFolderGroup {
	folder: string;
	rows: NoteHistoryRow[];
}

export function groupNoteRowsByFolder(rows: NoteHistoryRow[]): NoteFolderGroup[] {
	const groups = new Map<string, NoteHistoryRow[]>();
	for (const row of rows) {
		const folder = row.folder || '/';
		const bucket = groups.get(folder) ?? [];
		bucket.push(row);
		groups.set(folder, bucket);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([folder, folderRows]) => ({ folder, rows: folderRows }));
}

export function sortBookRows(rows: BookHistoryRow[], mode: BookSortMode): BookHistoryRow[] {
	const sorted = [...rows];
	switch (mode) {
		case 'title':
			sorted.sort((a, b) => a.title.localeCompare(b.title));
			break;
		case 'progress':
			sorted.sort((a, b) => b.progressPercent - a.progressPercent);
			break;
		case 'lastRead':
		default:
			sorted.sort((a, b) => {
				const aTime = a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : 0;
				const bTime = b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : 0;
				return bTime - aTime;
			});
			break;
	}
	return sorted;
}

export function filterBookRowsBySearch(rows: BookHistoryRow[], query: string): BookHistoryRow[] {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) {
		return rows;
	}
	return rows.filter(
		(row) =>
			row.title.toLowerCase().includes(trimmed) ||
			row.sourcePath.toLowerCase().includes(trimmed)
	);
}

export interface BookFolderGroup {
	folder: string;
	rows: BookHistoryRow[];
}

export function groupBookRowsByFolder(rows: BookHistoryRow[]): BookFolderGroup[] {
	const groups = new Map<string, BookHistoryRow[]>();
	for (const row of rows) {
		const folder = row.folder || '/';
		const bucket = groups.get(folder) ?? [];
		bucket.push(row);
		groups.set(folder, bucket);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([folder, folderRows]) => ({ folder, rows: folderRows }));
}
