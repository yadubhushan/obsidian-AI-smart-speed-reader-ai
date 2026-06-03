import { Notice, Modal, type App } from 'obsidian';
import type { ManifestStore } from '../store/ManifestStore';
import { docKeyFromSourcePath } from '../store/docKey';
import type { PluginServices } from '../services/serviceRegistry';
import { continueReading, resolveContinueReadingTarget } from './continueReading';
import {
	defaultHistoryFilters,
	type HistoryFilterChip,
	type HistoryFilterState,
	MAX_PINS,
	countPinnedSources
} from './historyFilters';
import type { HistoryModalContext } from './historyModalContext';
import { renderBooksTab, type BooksTabViewHandle } from './booksTabView';
import { renderNotesTab, type NotesTabViewHandle } from './notesTabView';
import { renderContinueReadingCard } from './dashboardCards';
import type { BookHistoryRow, NoteHistoryRow } from './historyListModel';

export interface ReadingHistoryModalDeps {
	app: App;
	services: PluginServices;
	getManifestStore: () => ManifestStore;
}

type DashboardTab = 'books' | 'notes';

interface DashboardViewState {
	activeTab: DashboardTab;
	searchExpanded: boolean;
	searchQuery: string;
	filters: HistoryFilterState;
}

export class ReadingHistoryModal extends Modal {
	private booksTab: BooksTabViewHandle | null = null;
	private notesTab: NotesTabViewHandle | null = null;
	private filterChipEls = new Map<HistoryFilterChip, HTMLButtonElement>();
	private tabEls = new Map<DashboardTab, HTMLButtonElement>();
	private heroHost: HTMLElement | null = null;
	private searchWrap: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private booksPane: HTMLElement | null = null;
	private notesPane: HTMLElement | null = null;
	private coverUrls: string[] = [];
	private disposed = false;
	private viewState: DashboardViewState = {
		activeTab: 'books',
		searchExpanded: false,
		searchQuery: '',
		filters: defaultHistoryFilters()
	};
	private context: HistoryModalContext = {
		filters: this.viewState.filters,
		searchQuery: this.viewState.searchQuery,
		continueSourcePath: null,
		onFiltersChange: (next) => {
			this.viewState.filters = next;
			this.context.filters = next;
			this.syncFilterChips();
			this.refreshTabs();
		},
		onSearchQueryChange: (query) => {
			this.viewState.searchQuery = query;
			this.context.searchQuery = query;
			this.refreshTabs();
		},
		onStateChanged: () => {
			void this.refreshDashboardState();
		}
	};

	constructor(
		app: App,
		private readonly deps: ReadingHistoryModalDeps
	) {
		super(app);
	}

	onOpen(): void {
		this.disposed = false;
		void this.openWithFreshState();
	}

	onClose(): void {
		this.disposed = true;
		this.booksTab?.destroy();
		this.notesTab?.destroy();
		this.booksTab = null;
		this.notesTab = null;
		for (const url of this.coverUrls) {
			URL.revokeObjectURL(url);
		}
		this.coverUrls.length = 0;
		this.contentEl.empty();
	}

	private async openWithFreshState(): Promise<void> {
		await this.deps.services.readingStateStore.reloadFromDisk();
		if (this.disposed) {
			return;
		}

		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass('speed-reader-dashboard-modal');

		const header = contentEl.createDiv({ cls: 'speed-reader-dashboard-header' });
		const headingBlock = header.createDiv({ cls: 'speed-reader-dashboard-header__copy' });
		headingBlock.createDiv({
			cls: 'speed-reader-dashboard-header__eyebrow',
			text: 'Library'
		});
		headingBlock.createEl('h2', { text: 'Reading Dashboard' });
		headingBlock.createDiv({
			cls: 'speed-reader-dashboard-header__subtitle',
			text: 'Pick up where you left off and keep your reading momentum.'
		});

		const headerActions = header.createDiv({
			cls: 'speed-reader-dashboard-header__actions'
		});
		const searchToggle = headerActions.createEl('button', {
			cls: 'speed-reader-dashboard-search-toggle',
			text: 'Search',
			attr: { type: 'button', 'aria-expanded': 'false' }
		});
		searchToggle.addEventListener('click', () => {
			this.viewState.searchExpanded = !this.viewState.searchExpanded;
			this.syncSearchVisibility();
			searchToggle.setAttribute(
				'aria-expanded',
				this.viewState.searchExpanded ? 'true' : 'false'
			);
			if (this.viewState.searchExpanded) {
				this.searchInput?.focus();
			} else if (this.viewState.searchQuery) {
				this.viewState.searchQuery = '';
				this.context.searchQuery = '';
				if (this.searchInput) {
					this.searchInput.value = '';
				}
				this.refreshTabs();
			}
		});

		this.heroHost = contentEl.createDiv({ cls: 'speed-reader-dashboard-hero-host' });

		const tabBar = contentEl.createDiv({ cls: 'speed-reader-dashboard-tabs' });
		this.createTabButton(tabBar, 'books', 'Books');
		this.createTabButton(tabBar, 'notes', 'Notes');

		const filterBar = contentEl.createDiv({ cls: 'speed-reader-dashboard-filters' });
		this.createFilterButton(filterBar, 'inProgress', 'In Progress');
		this.createFilterButton(filterBar, 'pinned', `Pinned 0/${MAX_PINS}`);
		this.createFilterButton(filterBar, 'finished', 'Finished');

		this.searchWrap = contentEl.createDiv({
			cls: 'speed-reader-dashboard-search'
		});
		this.searchInput = this.searchWrap.createEl('input', {
			type: 'search',
			cls: 'speed-reader-dashboard-search__input',
			placeholder: 'Search by title, author, or reading mode'
		});
		this.searchInput.addEventListener('input', () => {
			this.context.onSearchQueryChange(this.searchInput?.value ?? '');
		});
		this.syncSearchVisibility();

		const body = contentEl.createDiv({ cls: 'speed-reader-dashboard-body' });
		this.booksPane = body.createDiv({
			cls: 'speed-reader-dashboard-body__pane is-active'
		});
		this.notesPane = body.createDiv({ cls: 'speed-reader-dashboard-body__pane' });

		this.booksTab = renderBooksTab(this.booksPane, {
			app: this.app,
			services: this.deps.services,
			context: this.context
		});
		this.notesTab = renderNotesTab(this.notesPane, {
			app: this.app,
			services: this.deps.services,
			getManifestStore: this.deps.getManifestStore,
			context: this.context
		});

		this.syncTabState();
		this.syncFilterChips();
		await this.refreshDashboardState();
	}

	private createTabButton(parent: HTMLElement, tab: DashboardTab, label: string): void {
		const button = parent.createEl('button', {
			cls: `speed-reader-dashboard-tab${this.viewState.activeTab === tab ? ' is-active' : ''}`,
			text: label,
			attr: { type: 'button' }
		});
		button.addEventListener('click', () => {
			this.viewState.activeTab = tab;
			this.syncTabState();
		});
		this.tabEls.set(tab, button);
	}

	private createFilterButton(
		parent: HTMLElement,
		chip: HistoryFilterChip,
		label: string
	): void {
		const button = parent.createEl('button', {
			cls: 'speed-reader-dashboard-filter',
			text: label,
			attr: { type: 'button' }
		});
		button.addEventListener('click', () => {
			const next = {
				...this.viewState.filters,
				[chip]: !this.viewState.filters[chip]
			};
			this.context.onFiltersChange(next);
		});
		this.filterChipEls.set(chip, button);
	}

	private syncSearchVisibility(): void {
		this.searchWrap?.toggleClass('is-expanded', this.viewState.searchExpanded);
	}

	private syncTabState(): void {
		for (const [tab, button] of this.tabEls) {
			button.toggleClass('is-active', tab === this.viewState.activeTab);
		}
		this.booksPane?.toggleClass('is-active', this.viewState.activeTab === 'books');
		this.notesPane?.toggleClass('is-active', this.viewState.activeTab === 'notes');
	}

	private syncFilterChips(): void {
		for (const [chip, button] of this.filterChipEls) {
			button.toggleClass('is-active', this.viewState.filters[chip]);
		}
	}

	private async refreshDashboardState(): Promise<void> {
		if (this.disposed) {
			return;
		}

		await this.deps.services.readingStateStore.reloadFromDisk();
		const target = await resolveContinueReadingTarget({
			app: this.app,
			services: this.deps.services
		});
		this.context.continueSourcePath = target?.sourcePath ?? null;

		const file = await this.deps.services.readingStateStore.load();
		const pinnedCount = countPinnedSources(file);
		const pinnedFilter = this.filterChipEls.get('pinned');
		if (pinnedFilter) {
			pinnedFilter.setText(`Pinned ${pinnedCount}/${MAX_PINS}`);
		}

		if (this.heroHost) {
			for (const url of this.coverUrls) {
				URL.revokeObjectURL(url);
			}
			this.coverUrls.length = 0;

			const heroRow = target
				? this.buildContinueCardRow(target.state.sourceKind, target.state)
				: null;
			renderContinueReadingCard(
				this.heroHost,
				heroRow,
				{
					app: this.app,
					services: this.deps.services,
					coverUrls: this.coverUrls,
					isDisposed: () => this.disposed,
					onOpen: () => {
						void this.handleContinueReading();
					}
				},
				() => {
					void this.handleContinueReading();
				}
			);
		}

		this.refreshTabs();
	}

	private buildContinueCardRow(
		sourceKind: 'book' | 'note',
		state: NonNullable<Awaited<ReturnType<typeof resolveContinueReadingTarget>>>['state']
	): BookHistoryRow | NoteHistoryRow {
		const base = {
			sourcePath: state.sourcePath,
			title: state.title,
			folder: state.folder,
			status: state.status,
			progressPercent: state.progressPercent,
			lastOpenedAt: state.lastOpenedAt,
			pinned: state.pinned,
			pinnedAt: state.pinnedAt,
			docKey: docKeyFromSourcePath(state.sourcePath),
			typeLabel: sourceKind === 'book' ? ('Book' as const) : ('Note' as const),
			lengthLabel: sourceKind === 'book' ? 'Ready to read' : 'Resume note',
			lastReadLabel: 'Continue where you left off',
			progressLabel: `${Math.round(state.progressPercent)}% complete`,
			surfaceKind: sourceKind,
			isContinueTarget: true
		};

		if (sourceKind === 'book') {
			return {
				...base,
				author: state.author,
				section: 'main'
			};
		}

		return {
			...base,
			badge: state.preferredAiVersionId ? 'ai' : 'deterministic',
			badgeLabel: state.preferredAiVersionId ? 'AI ready' : 'Deterministic',
			position: state.position as NoteHistoryRow['position']
		};
	}

	private refreshTabs(): void {
		this.booksTab?.refresh();
		this.notesTab?.refresh();
	}

	private async handleContinueReading(): Promise<void> {
		const ok = await continueReading({
			app: this.app,
			services: this.deps.services
		});
		if (!ok) {
			new Notice('No recent reading session.');
			return;
		}
		this.close();
	}
}

export function openReadingHistoryModal(deps: ReadingHistoryModalDeps): void {
	new ReadingHistoryModal(deps.app, deps).open();
}
