import type { App } from 'obsidian';
import type { ManifestStore } from '../../store/ManifestStore';
import type { PluginServices } from '../../services/serviceRegistry';
import {
	defaultHistoryFilters,
	type HistoryFilterChip,
	type HistoryFilterState
} from '../historyFilters';
import type { HistoryModalContext } from '../historyModalContext';
import { renderBooksTab, type BooksTabViewHandle } from '../booksTabView';
import { renderNotesTab, type NotesTabViewHandle } from '../notesTabView';

const CHIP_LABELS: Record<HistoryFilterChip, string> = {
	inProgress: 'In progress',
	pinned: 'Pinned',
	finished: 'Finished'
};

export interface LibraryLandingViewDeps {
	app: App;
	services: PluginServices;
	getManifestStore: () => ManifestStore;
	context: HistoryModalContext;
}

export interface LibraryLandingViewHandle {
	destroy(): void;
	refresh(): void;
	syncFilterChips(): void;
}

export function renderLibraryLandingView(
	container: HTMLElement,
	deps: LibraryLandingViewDeps
): LibraryLandingViewHandle {
	const { app, services, getManifestStore, context } = deps;

	const root = container.createDiv({ cls: 'speed-reader-landing-library' });
	root.createEl('h2', { cls: 'speed-reader-landing-library__title', text: 'Library' });

	const filtersEl = root.createDiv({ cls: 'speed-reader-history-filters' });
	const filterChipEls = new Map<HistoryFilterChip, HTMLButtonElement>();

	for (const chip of Object.keys(CHIP_LABELS) as HistoryFilterChip[]) {
		const btn = filtersEl.createEl('button', {
			cls: 'speed-reader-history-filter-chip',
			text: CHIP_LABELS[chip],
			attr: { type: 'button' }
		});
		btn.addEventListener('click', () => {
			const next = { ...context.filters, [chip]: !context.filters[chip] };
			context.onFiltersChange(next);
		});
		filterChipEls.set(chip, btn);
	}

	const tabs = root.createDiv({ cls: 'speed-reader-history-tabs' });
	const booksTabBtn = tabs.createEl('button', {
		cls: 'speed-reader-history-tab is-active',
		text: 'Books'
	});
	const notesTabBtn = tabs.createEl('button', {
		cls: 'speed-reader-history-tab',
		text: 'Notes'
	});

	const body = root.createDiv({ cls: 'speed-reader-landing-library__body' });
	const booksPane = body.createDiv({ cls: 'speed-reader-history-pane is-active' });
	const notesPane = body.createDiv({ cls: 'speed-reader-history-pane' });

	booksTabBtn.addEventListener('click', () => {
		booksTabBtn.addClass('is-active');
		notesTabBtn.removeClass('is-active');
		booksPane.addClass('is-active');
		notesPane.removeClass('is-active');
	});
	notesTabBtn.addEventListener('click', () => {
		notesTabBtn.addClass('is-active');
		booksTabBtn.removeClass('is-active');
		notesPane.addClass('is-active');
		booksPane.removeClass('is-active');
	});

	const booksTab = renderBooksTab(booksPane, { app, services, context });
	const notesTab = renderNotesTab(notesPane, {
		app,
		services,
		getManifestStore,
		context
	});

	function syncFilterChips(): void {
		for (const [chip, el] of filterChipEls) {
			el.toggleClass('is-active', context.filters[chip]);
		}
	}

	syncFilterChips();

	return {
		refresh: () => {
			booksTab.refresh();
			notesTab.refresh();
		},
		syncFilterChips,
		destroy: () => {
			booksTab.destroy();
			notesTab.destroy();
			container.empty();
		}
	};
}

export function createLibraryContext(
	onFiltersChange: (filters: HistoryFilterState) => void,
	onStateChanged: () => void
): HistoryModalContext {
	const filters = defaultHistoryFilters();
	return {
		filters,
		onFiltersChange: (next) => {
			Object.assign(filters, next);
			onFiltersChange(next);
		},
		onStateChanged
	};
}
