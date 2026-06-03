import { docKeyFromSourcePath } from '../store/docKey';
import { noteHasReadyVersion } from '../store/cacheIndexUtils';
import type { DocumentCacheIndex, ProcessedDocument } from '../types/processedDocument';
import type {
	BookCacheIndex,
	EpubVaultEntry,
	NotePosition,
	ReadingState,
	ReadingStateFile,
	ReadingStatus
} from '../types/m2Contracts';
import type { HistoryFilterState, HistoryRowFilterable } from './historyFilters';

export type BookSortMode = 'lastRead' | 'title' | 'progress';
export type NotePlaybackBadge = 'ai' | 'deterministic';
export type DashboardSurfaceKind = 'book' | 'note';
export type DashboardSectionKind = 'pinned' | 'inProgress' | 'upNext' | 'finished';

export interface DashboardSection<T> {
	key: DashboardSectionKind;
	title: string;
	rows: T[];
}

interface HistoryDisplayFields {
	typeLabel: 'Book' | 'Note';
	lengthLabel: string;
	lastReadLabel: string;
	progressLabel: string;
	surfaceKind: DashboardSurfaceKind;
}

export interface BookHistoryRow extends HistoryRowFilterable, HistoryDisplayFields {
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
	isContinueTarget: boolean;
}

export interface NoteHistoryRow extends HistoryRowFilterable, HistoryDisplayFields {
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
	badgeLabel: string;
	position: NotePosition;
	isContinueTarget: boolean;
}

export interface BookHistoryModel {
	main: BookHistoryRow[];
	unread: BookHistoryRow[];
}

export interface BuildBookHistoryModelInput {
	entries: EpubVaultEntry[];
	getReadingState: (sourcePath: string) => ReadingState | undefined;
	getCachedIndex: (docKey: string) => Promise<BookCacheIndex | null>;
	continueSourcePath?: string | null;
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

function formatWordCountLabel(wordCount: number): string {
	if (wordCount >= 1000) {
		const rounded = Math.round(wordCount / 100) / 10;
		return `${rounded}k words`;
	}
	return `${wordCount} words`;
}

export function formatRelativeLastOpened(iso?: string): string {
	if (!iso) {
		return 'Not started yet';
	}
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return 'Recently opened';
	}
	const now = Date.now();
	const diffMs = date.getTime() - now;
	const dayMs = 24 * 60 * 60 * 1000;
	const diffDays = Math.round(diffMs / dayMs);
	const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
	if (Math.abs(diffDays) < 1) {
		const diffHours = Math.round(diffMs / (60 * 60 * 1000));
		if (Math.abs(diffHours) < 1) {
			return 'Last read just now';
		}
		return `Last read ${rtf.format(diffHours, 'hour')}`;
	}
	if (Math.abs(diffDays) < 30) {
		return `Last read ${rtf.format(diffDays, 'day')}`;
	}
	const diffMonths = Math.round(diffDays / 30);
	if (Math.abs(diffMonths) < 12) {
		return `Last read ${rtf.format(diffMonths, 'month')}`;
	}
	const diffYears = Math.round(diffMonths / 12);
	return `Last read ${rtf.format(diffYears, 'year')}`;
}

function bookLengthLabel(cached: BookCacheIndex | null): string {
	const chapterCount = cached?.chapters.length ?? 0;
	if (chapterCount > 0) {
		return `${chapterCount} chapter${chapterCount === 1 ? '' : 's'}`;
	}
	if (cached?.totalWordCount) {
		return formatWordCountLabel(cached.totalWordCount);
	}
	return 'Ready to read';
}

function buildRow(
	entry: EpubVaultEntry,
	state: ReadingState | undefined,
	cached: BookCacheIndex | null,
	section: 'main' | 'unread',
	continueSourcePath: string | null
): BookHistoryRow {
	const docKey = docKeyFromSourcePath(entry.sourcePath);
	const progressPercent = state?.progressPercent ?? 0;
	return {
		sourcePath: entry.sourcePath,
		title: resolveTitle(entry, state, cached),
		author: resolveAuthor(state, cached),
		folder: state?.folder ?? entry.folder,
		status: state?.status ?? 'unread',
		progressPercent,
		lastOpenedAt: state?.lastOpenedAt,
		pinned: state?.pinned ?? false,
		pinnedAt: state?.pinnedAt,
		docKey,
		section,
		typeLabel: 'Book',
		lengthLabel: bookLengthLabel(cached),
		lastReadLabel: section === 'unread' ? 'Not started yet' : formatRelativeLastOpened(state?.lastOpenedAt),
		progressLabel: `${Math.max(0, Math.min(100, Math.round(progressPercent)))}% complete`,
		surfaceKind: 'book',
		isContinueTarget: entry.sourcePath === continueSourcePath
	};
}

export function noteBadgeFromIndex(index: DocumentCacheIndex | null): NotePlaybackBadge {
	if (!index) {
		return 'deterministic';
	}
	return noteHasReadyVersion(index) ? 'ai' : 'deterministic';
}

function countDocumentWords(processed: ProcessedDocument): number {
	if (processed.kind === 'sections') {
		return processed.sections.reduce(
			(total, section) =>
				total + section.stream.filter((token) => token.kind === 'word').length,
			0
		);
	}
	return processed.stream.filter((token) => token.kind === 'word').length;
}

export function noteLengthLabelFromProcessed(
	processed: ProcessedDocument | null | undefined
): string {
	if (!processed) {
		return 'Ready to read';
	}
	if (processed.kind === 'sections') {
		const count = processed.sections.length;
		return `${count} section${count === 1 ? '' : 's'}`;
	}
	const words = countDocumentWords(processed);
	if (words <= 0) {
		return 'Ready to read';
	}
	const minutes = Math.max(1, Math.round(words / 220));
	return `${minutes} min read`;
}

export function buildNoteHistoryModel(
	file: ReadingStateFile,
	getManifestIndex: (sourcePath: string) => Promise<DocumentCacheIndex | null>,
	getProcessedDocument?: (sourcePath: string) => Promise<ProcessedDocument | null>,
	continueSourcePath?: string | null
): Promise<NoteHistoryRow[]> {
	const noteStates = Object.values(file.sources).filter(
		(state) =>
			state.sourceKind === 'note' &&
			(state.status === 'in_progress' || state.status === 'finished')
	);

	return Promise.all(
		noteStates.map(async (state) => {
			const index = await getManifestIndex(state.sourcePath);
			const processed = getProcessedDocument
				? await getProcessedDocument(state.sourcePath)
				: null;
			const position = state.position as NotePosition;
			const badge = noteBadgeFromIndex(index);
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
				badge,
				badgeLabel: badge === 'ai' ? 'AI ready' : 'Deterministic',
				position,
				typeLabel: 'Note',
				lengthLabel: noteLengthLabelFromProcessed(processed),
				lastReadLabel: formatRelativeLastOpened(state.lastOpenedAt),
				progressLabel: `${Math.max(0, Math.min(100, Math.round(state.progressPercent)))}% complete`,
				surfaceKind: 'note',
				isContinueTarget: state.sourcePath === continueSourcePath
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
			unread.push(buildRow(entry, state, cached, 'unread', input.continueSourcePath ?? null));
			continue;
		}

		if (state.sourceKind !== 'book') {
			continue;
		}

		if (state.status === 'in_progress' || state.status === 'finished') {
			main.push(buildRow(entry, state, cached, 'main', input.continueSourcePath ?? null));
		}
	}

	return { main, unread };
}

function compareLastRead<T extends { lastOpenedAt?: string }>(a: T, b: T): number {
	const aTime = a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : 0;
	const bTime = b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : 0;
	return bTime - aTime;
}

function normalizedSearch(query: string): string {
	return query.trim().toLowerCase();
}

function matchesSearch(query: string, fields: Array<string | undefined>): boolean {
	const trimmed = normalizedSearch(query);
	if (!trimmed) {
		return true;
	}
	return fields.some((value) => value?.toLowerCase().includes(trimmed));
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
			sorted.sort(compareLastRead);
			break;
	}
	return sorted;
}

export function filterNoteRowsBySearch(rows: NoteHistoryRow[], query: string): NoteHistoryRow[] {
	return rows.filter((row) =>
		matchesSearch(query, [row.title, row.badgeLabel, row.typeLabel, row.lengthLabel])
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
			sorted.sort(compareLastRead);
			break;
	}
	return sorted;
}

export function filterBookRowsBySearch(rows: BookHistoryRow[], query: string): BookHistoryRow[] {
	return rows.filter((row) =>
		matchesSearch(query, [row.title, row.author, row.typeLabel, row.lengthLabel])
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

function dedupeRows<T extends { sourcePath: string }>(rows: T[]): T[] {
	const seen = new Set<string>();
	const unique: T[] = [];
	for (const row of rows) {
		if (seen.has(row.sourcePath)) {
			continue;
		}
		seen.add(row.sourcePath);
		unique.push(row);
	}
	return unique;
}

export function buildBookDashboardSections(
	model: BookHistoryModel,
	filters: HistoryFilterState,
	searchQuery: string
): DashboardSection<BookHistoryRow>[] {
	const sections: DashboardSection<BookHistoryRow>[] = [];
	const searchedMain = filterBookRowsBySearch(model.main, searchQuery);
	const searchedUnread = sortBookRows(filterBookRowsBySearch(model.unread, searchQuery), 'title');

	const pinnedRows = filters.pinned
		? dedupeRows(sortBookRows(searchedMain.filter((row) => row.pinned), 'lastRead'))
		: [];
	const pinnedPaths = new Set(pinnedRows.map((row) => row.sourcePath));
	if (pinnedRows.length > 0) {
		sections.push({ key: 'pinned', title: 'Pinned', rows: pinnedRows });
	}

	if (filters.inProgress) {
		const inProgressRows = sortBookRows(
			searchedMain.filter(
				(row) => row.status === 'in_progress' && (!filters.pinned || !pinnedPaths.has(row.sourcePath))
			),
			'lastRead'
		);
		if (inProgressRows.length > 0) {
			sections.push({ key: 'inProgress', title: 'In Progress', rows: inProgressRows });
		}
	}

	if (searchedUnread.length > 0) {
		sections.push({ key: 'upNext', title: 'Up Next', rows: searchedUnread });
	}

	if (filters.finished) {
		const finishedRows = sortBookRows(
			searchedMain.filter(
				(row) => row.status === 'finished' && (!filters.pinned || !pinnedPaths.has(row.sourcePath))
			),
			'lastRead'
		);
		if (finishedRows.length > 0) {
			sections.push({ key: 'finished', title: 'Finished', rows: finishedRows });
		}
	}

	return sections;
}

export function buildNoteDashboardSections(
	rows: NoteHistoryRow[],
	filters: HistoryFilterState,
	searchQuery: string
): DashboardSection<NoteHistoryRow>[] {
	const sections: DashboardSection<NoteHistoryRow>[] = [];
	const searched = filterNoteRowsBySearch(rows, searchQuery);

	const pinnedRows = filters.pinned
		? dedupeRows(sortNoteRows(searched.filter((row) => row.pinned), 'lastRead'))
		: [];
	const pinnedPaths = new Set(pinnedRows.map((row) => row.sourcePath));
	if (pinnedRows.length > 0) {
		sections.push({ key: 'pinned', title: 'Pinned', rows: pinnedRows });
	}

	if (filters.inProgress) {
		const inProgressRows = sortNoteRows(
			searched.filter(
				(row) => row.status === 'in_progress' && (!filters.pinned || !pinnedPaths.has(row.sourcePath))
			),
			'lastRead'
		);
		if (inProgressRows.length > 0) {
			sections.push({ key: 'inProgress', title: 'In Progress', rows: inProgressRows });
		}
	}

	if (filters.finished) {
		const finishedRows = sortNoteRows(
			searched.filter(
				(row) => row.status === 'finished' && (!filters.pinned || !pinnedPaths.has(row.sourcePath))
			),
			'lastRead'
		);
		if (finishedRows.length > 0) {
			sections.push({ key: 'finished', title: 'Finished', rows: finishedRows });
		}
	}

	return sections;
}
