import type { HistoryFilterState } from './historyFilters';

export interface HistoryModalContext {
	filters: HistoryFilterState;
	onFiltersChange: (filters: HistoryFilterState) => void;
	onStateChanged: () => void;
}
