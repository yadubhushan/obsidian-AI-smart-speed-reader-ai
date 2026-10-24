import { ItemView, Notice, setIcon, type App, type WorkspaceLeaf } from 'obsidian';
import type { ManifestStore } from '../store/ManifestStore';
import { docKeyFromSourcePath } from '../store/docKey';
import type { PluginServices } from '../services/serviceRegistry';
import type { ReadingState } from '../types/m2Contracts';
import { continueReading, resolveContinueReadingTarget } from './continueReading';
import {
	defaultHistoryFilters,
	type HistoryFilterChip,
	MAX_PINS,
	countPinnedSources
} from './historyFilters';
import type { HistoryModalContext } from './historyModalContext';
import { renderBooksTab, type BooksTabViewHandle } from './booksTabView';
import { renderNotesTab, type NotesTabViewHandle } from './notesTabView';
import { renderContinueReadingCard } from './dashboardCards';
import { resolveBookName, type BookHistoryRow, type NoteHistoryRow } from './historyListModel';

export const LIBRARY_VIEW_TYPE = 'speed-reader-ai-library';

export interface LibraryViewDeps {
	services: PluginServices;
	getManifestStore: () => ManifestStore;
}

type LibraryTab = 'books' | 'notes';

const CHIP_LABELS: Record<HistoryFilterChip, string> = {
	inProgress: 'Reading',
	pinned: 'Pinned',
	upNext: 'Up next',
	finished: 'Finished'
};

const BOOK_ONLY_CHIPS = new Set<HistoryFilterChip>(['upNext']);

export class LibraryView extends ItemView {
	private booksTab: BooksTabViewHandle | null = null;
	private notesTab: NotesTabViewHandle | null = null;
	private filterChipEls = new Map<HistoryFilterChip, HTMLButtonElement>();
	private tabEls = new Map<LibraryTab, HTMLButtonElement>();
	private heroHost: HTMLElement | null = null;
	private booksPane: HTMLElement | null = null;
	private notesPane: HTMLElement | null = null;
	private coverUrls: string[] = [];
	private disposed = false;
	private activeTab: LibraryTab = 'books';
	private refreshTimer: number | null = null;
	private unsubscribers: Array<() => void> = [];
	private context: HistoryModalContext = {
		filters: defaultHistoryFilters(),
		searchQuery: '',
		continueSourcePath: null,
		onFiltersChange: (next) => {
			this.context.filters = next;
			this.syncFilterChips();
			this.refreshTabs();
		},
		onSearchQueryChange: (query) => {
			this.context.searchQuery = query;
			this.refreshTabs();
		},
		onStateChanged: () => {
			void this.refreshDashboardState();
		}
	};

	constructor(
		leaf: WorkspaceLeaf,
		private readonly deps: LibraryViewDeps
	) {
		super(leaf);
	}

	getViewType(): string {
		return LIBRARY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Library';
	}

	getIcon(): string {
		return 'library';
	}

	async onOpen(): Promise<void> {
		this.disposed = false;
		const { eventBus } = this.deps.services;
		const scheduleRefresh = () => this.scheduleDashboardRefresh();
		this.unsubscribers = [
			eventBus.on('reader-closed', scheduleRefresh),
			eventBus.on('reading-state-flushed', scheduleRefresh),
			eventBus.on('library-metadata-changed', scheduleRefresh)
		];
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				// Pick up edits synced from other devices when the tab comes back into focus.
				if (leaf === this.leaf) {
					void this.reloadFromDisk();
				}
			})
		);

		this.buildLayout();
		await this.reloadFromDisk();
	}

	async onClose(): Promise<void> {
		this.disposed = true;
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		this.booksTab?.destroy();
		this.notesTab?.destroy();
		this.booksTab = null;
		this.notesTab = null;
		this.revokeCoverUrls();
		this.contentEl.empty();
	}

	private async reloadFromDisk(): Promise<void> {
		await Promise.all([
			this.deps.services.readingStateStore.reloadFromDisk(),
			this.deps.services.libraryMetadata.reload()
		]);
		await this.refreshDashboardState();
	}

	private buildLayout(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('srai-library');
		const page = contentEl.createDiv({ cls: 'srai-library__page' });

		const header = page.createDiv({ cls: 'srai-library__header' });
		header.createEl('h1', { cls: 'srai-library__title', text: 'Library' });

		const search = header.createDiv({ cls: 'srai-library__search' });
		setIcon(search.createSpan({ cls: 'srai-library__search-icon' }), 'search');
		const searchInput = search.createEl('input', {
			type: 'search',
			cls: 'srai-library__search-input',
			attr: { placeholder: 'Search title or author', 'aria-label': 'Search library' }
		});
		searchInput.addEventListener('input', () => {
			this.context.onSearchQueryChange(searchInput.value);
		});

		this.heroHost = page.createDiv({ cls: 'speed-reader-dashboard-hero-host' });

		const toolbar = page.createDiv({ cls: 'srai-library__toolbar' });
		const tabBar = toolbar.createDiv({ cls: 'srai-library__tabs', attr: { role: 'tablist' } });
		this.createTabButton(tabBar, 'books', 'Books');
		this.createTabButton(tabBar, 'notes', 'Notes');

		const filterBar = toolbar.createDiv({ cls: 'srai-library__chips' });
		for (const chip of ['inProgress', 'pinned', 'upNext', 'finished'] as const) {
			this.createFilterButton(filterBar, chip);
		}

		const body = page.createDiv({ cls: 'srai-library__body' });
		this.booksPane = body.createDiv({ cls: 'speed-reader-dashboard-body__pane' });
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
	}

	private createTabButton(parent: HTMLElement, tab: LibraryTab, label: string): void {
		const button = parent.createEl('button', {
			cls: 'srai-library__tab',
			text: label,
			attr: { type: 'button', role: 'tab' }
		});
		button.addEventListener('click', () => {
			this.activeTab = tab;
			this.syncTabState();
		});
		this.tabEls.set(tab, button);
	}

	private createFilterButton(parent: HTMLElement, chip: HistoryFilterChip): void {
		const button = parent.createEl('button', {
			cls: 'srai-library__chip',
			text: CHIP_LABELS[chip],
			attr: { type: 'button' }
		});
		button.addEventListener('click', () => {
			this.context.onFiltersChange({
				...this.context.filters,
				[chip]: !this.context.filters[chip]
			});
		});
		this.filterChipEls.set(chip, button);
	}

	private syncTabState(): void {
		for (const [tab, button] of this.tabEls) {
			const active = tab === this.activeTab;
			button.toggleClass('is-active', active);
			button.setAttribute('aria-selected', active ? 'true' : 'false');
		}
		this.booksPane?.toggleClass('is-active', this.activeTab === 'books');
		this.notesPane?.toggleClass('is-active', this.activeTab === 'notes');
		for (const [chip, button] of this.filterChipEls) {
			button.toggleClass('is-hidden', this.activeTab !== 'books' && BOOK_ONLY_CHIPS.has(chip));
		}
	}

	private syncFilterChips(): void {
		for (const [chip, button] of this.filterChipEls) {
			const active = this.context.filters[chip];
			button.toggleClass('is-active', active);
			button.setAttribute('aria-pressed', active ? 'true' : 'false');
		}
	}

	private scheduleDashboardRefresh(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			void this.refreshDashboardState();
		}, 250);
	}

	private revokeCoverUrls(): void {
		for (const url of this.coverUrls) {
			URL.revokeObjectURL(url);
		}
		this.coverUrls.length = 0;
	}

	private async refreshDashboardState(): Promise<void> {
		if (this.disposed) {
			return;
		}

		const target = await resolveContinueReadingTarget({
			app: this.app,
			services: this.deps.services
		});
		if (this.disposed) {
			return;
		}
		this.context.continueSourcePath = target?.sourcePath ?? null;

		const file = await this.deps.services.readingStateStore.load();
		this.filterChipEls
			.get('pinned')
			?.setText(`${CHIP_LABELS.pinned} ${countPinnedSources(file)}/${MAX_PINS}`);

		if (this.heroHost) {
			this.revokeCoverUrls();
			renderContinueReadingCard(
				this.heroHost,
				target ? this.buildContinueCardRow(target.state) : null,
				{
					app: this.app,
					services: this.deps.services,
					coverUrls: this.coverUrls,
					isDisposed: () => this.disposed,
					onOpen: () => void this.handleContinueReading()
				},
				() => void this.handleContinueReading()
			);
		}

		this.refreshTabs();
	}

	private buildContinueCardRow(state: ReadingState): BookHistoryRow | NoteHistoryRow {
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
			lastReadLabel: 'Continue where you left off',
			progressLabel: `${Math.round(state.progressPercent)}% complete`,
			isContinueTarget: true
		};

		if (state.sourceKind === 'book') {
			const basename = state.sourcePath.split('/').pop() ?? state.sourcePath;
			const name = resolveBookName(
				{ sourcePath: state.sourcePath, title: basename, folder: state.folder },
				state,
				null,
				this.deps.services.libraryMetadata.get(state.sourcePath)
			);
			return {
				...base,
				...name,
				typeLabel: 'Book',
				lengthLabel: 'Ready to read',
				surfaceKind: 'book',
				section: 'main',
				inVault: true
			};
		}

		return {
			...base,
			typeLabel: 'Note',
			lengthLabel: 'Resume note',
			surfaceKind: 'note',
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
		}
	}
}

/** Focus the library tab, opening one in the main area if none exists. */
export async function activateLibraryView(app: App): Promise<void> {
	const existing = app.workspace.getLeavesOfType(LIBRARY_VIEW_TYPE)[0];
	const leaf = existing ?? app.workspace.getLeaf('tab');
	if (!existing) {
		await leaf.setViewState({ type: LIBRARY_VIEW_TYPE, active: true });
	}
	await app.workspace.revealLeaf(leaf);
}
