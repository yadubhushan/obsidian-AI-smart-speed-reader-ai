import type { HistoryFilterState } from './historyFilters';

export interface HistoryModalContext {
	filters: HistoryFilterState;
	searchQuery: string;
	continueSourcePath: string | null;
	onFiltersChange: (filters: HistoryFilterState) => void;
	onSearchQueryChange: (query: string) => void;
	onStateChanged: () => void;
}
