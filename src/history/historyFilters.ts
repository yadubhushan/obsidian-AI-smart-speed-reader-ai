import type { ReadingState, ReadingStateFile, ReadingStatus } from '../types/m2Contracts';

export const MAX_PINS = 5;
export const PIN_LIMIT_NOTICE = 'Maximum 5 pins. Unpin one to pin this item.';

export type HistoryFilterChip = 'inProgress' | 'pinned' | 'finished';

export interface HistoryFilterState {
	inProgress: boolean;
	pinned: boolean;
	finished: boolean;
}

export function defaultHistoryFilters(): HistoryFilterState {
	return { inProgress: true, pinned: false, finished: false };
}

export interface HistoryRowFilterable {
	sourcePath: string;
	status: ReadingStatus;
	pinned: boolean;
	pinnedAt?: string;
}

export function rowMatchesHistoryFilters(
	row: HistoryRowFilterable,
	filters: HistoryFilterState
): boolean {
	const selected: HistoryFilterChip[] = [];
	if (filters.inProgress) {
		selected.push('inProgress');
	}
	if (filters.pinned) {
		selected.push('pinned');
	}
	if (filters.finished) {
		selected.push('finished');
	}

	if (selected.length === 0) {
		return true;
	}

	return selected.some((chip) => {
		switch (chip) {
			case 'inProgress':
				return row.status === 'in_progress';
			case 'pinned':
				return row.pinned;
			case 'finished':
				return row.status === 'finished';
			default:
				return false;
		}
	});
}

export function applyHistoryFilters<T extends HistoryRowFilterable>(
	rows: T[],
	filters: HistoryFilterState
): T[] {
	return rows.filter((row) => rowMatchesHistoryFilters(row, filters));
}

export function countPinnedSources(file: ReadingStateFile): number {
	return Object.values(file.sources).filter((state) => state.pinned).length;
}

export function canPinMore(file: ReadingStateFile): boolean {
	return countPinnedSources(file) < MAX_PINS;
}

export function tryPinState(
	state: ReadingState,
	file: ReadingStateFile
): { ok: true; state: ReadingState } | { ok: false; reason: 'limit' } {
	if (state.pinned) {
		return {
			ok: true,
			state: {
				...state,
				pinned: false,
				pinnedAt: undefined
			}
		};
	}

	if (!canPinMore(file)) {
		return { ok: false, reason: 'limit' };
	}

	return {
		ok: true,
		state: {
			...state,
			pinned: true,
			pinnedAt: new Date().toISOString()
		}
	};
}

export function sortByPinnedFirst<T extends HistoryRowFilterable>(
	rows: T[],
	thenCompare: (a: T, b: T) => number
): T[] {
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
		return thenCompare(a, b);
	});
}
