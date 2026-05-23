import { Notice, Modal, type App } from 'obsidian';
import type { ManifestStore } from '../store/ManifestStore';
import type { PluginServices } from '../services/serviceRegistry';
import { continueReading, resolveContinueReadingTarget } from './continueReading';
import {
	defaultHistoryFilters,
	type HistoryFilterChip,
	type HistoryFilterState
} from './historyFilters';
import type { HistoryModalContext } from './historyModalContext';
import { renderBooksTab, type BooksTabViewHandle } from './booksTabView';
import { renderNotesTab, type NotesTabViewHandle } from './notesTabView';

export interface ReadingHistoryModalDeps {
	app: App;
	services: PluginServices;
	getManifestStore: () => ManifestStore;
}

const CHIP_LABELS: Record<HistoryFilterChip, string> = {
	inProgress: 'In progress',
	pinned: 'Pinned',
	finished: 'Finished'
};

export class ReadingHistoryModal extends Modal {
	private booksTab: BooksTabViewHandle | null = null;
	private notesTab: NotesTabViewHandle | null = null;
	private filters: HistoryFilterState = defaultHistoryFilters();
	private continueBtn: HTMLButtonElement | null = null;
	private filterChipEls = new Map<HistoryFilterChip, HTMLButtonElement>();
	private context: HistoryModalContext;

	constructor(
		app: App,
		private readonly deps: ReadingHistoryModalDeps
	) {
		super(app);
		this.context = {
			filters: this.filters,
			onFiltersChange: (next) => {
				this.filters = next;
				this.context.filters = next;
				this.syncFilterChips();
				this.refreshTabs();
			},
			onStateChanged: () => this.refreshTabs()
		};
	}

	onOpen(): void {
		void this.openWithFreshState();
	}

	private async openWithFreshState(): Promise<void> {
		await this.deps.services.readingStateStore.reloadFromDisk();

		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass('speed-reader-history-modal');

		const header = contentEl.createDiv({ cls: 'speed-reader-history-header' });
		header.createEl('h2', { text: 'Reading history' });

		const hero = contentEl.createDiv({ cls: 'speed-reader-history-hero' });
		this.continueBtn = hero.createEl('button', {
			cls: 'mod-cta speed-reader-history-continue',
			text: 'Continue reading'
		});
		this.continueBtn.addEventListener('click', () => {
			void this.handleContinueReading();
		});
		void this.updateContinueButton();

		const filtersEl = contentEl.createDiv({ cls: 'speed-reader-history-filters' });
		for (const chip of Object.keys(CHIP_LABELS) as HistoryFilterChip[]) {
			const btn = filtersEl.createEl('button', {
				cls: 'speed-reader-history-filter-chip',
				text: CHIP_LABELS[chip],
				attr: { type: 'button' }
			});
			btn.addEventListener('click', () => {
				const next = { ...this.filters, [chip]: !this.filters[chip] };
				this.context.onFiltersChange(next);
			});
			this.filterChipEls.set(chip, btn);
		}
		this.syncFilterChips();

		const tabs = header.createDiv({ cls: 'speed-reader-history-tabs' });
		const booksTabBtn = tabs.createEl('button', {
			cls: 'speed-reader-history-tab is-active',
			text: 'Books'
		});
		const notesTabBtn = tabs.createEl('button', {
			cls: 'speed-reader-history-tab',
			text: 'Notes'
		});

		const body = contentEl.createDiv({ cls: 'speed-reader-history-body' });
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

		this.booksTab = renderBooksTab(booksPane, {
			app: this.app,
			services: this.deps.services,
			context: this.context
		});
		this.notesTab = renderNotesTab(notesPane, {
			app: this.app,
			services: this.deps.services,
			getManifestStore: this.deps.getManifestStore,
			context: this.context
		});
	}

	onClose(): void {
		this.booksTab?.destroy();
		this.notesTab?.destroy();
		this.booksTab = null;
		this.notesTab = null;
		this.contentEl.empty();
	}

	private syncFilterChips(): void {
		for (const [chip, el] of this.filterChipEls) {
			el.toggleClass('is-active', this.filters[chip]);
		}
	}

	private refreshTabs(): void {
		this.booksTab?.refresh();
		this.notesTab?.refresh();
		void this.updateContinueButton();
	}

	private async updateContinueButton(): Promise<void> {
		if (!this.continueBtn) {
			return;
		}
		const target = await resolveContinueReadingTarget({
			app: this.app,
			services: this.deps.services
		});
		const enabled = target !== null;
		this.continueBtn.disabled = !enabled;
		this.continueBtn.setAttr(
			'title',
			enabled ? `Resume ${target.state.title}` : 'No recent reading session.'
		);
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
