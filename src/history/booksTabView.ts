import { Notice, type App } from 'obsidian';
import { bookCacheBasePath, bookCacheCoverPath } from '../store/bookCachePaths';
import type { PluginServices } from '../services/serviceRegistry';
import type { BookPosition } from '../types/m2Contracts';
import {
	applyHistoryFilters,
	sortByPinnedFirst
} from './historyFilters';
import {
	buildBookHistoryModel,
	filterBookRowsBySearch,
	groupBookRowsByFolder,
	sortBookRows,
	type BookHistoryRow,
	type BookSortMode
} from './historyListModel';
import { toggleHistoryPin } from './historyPinActions';
import type { HistoryModalContext } from './historyModalContext';
import { renderProgressRing } from './progressRing';

export interface BooksTabViewHandle {
	destroy(): void;
	refresh(): void;
}

export interface BooksTabViewDeps {
	app: App;
	services: PluginServices;
	context: HistoryModalContext;
}

const FILTER_EMPTY_MESSAGE =
	'Nothing in progress yet. Open a book or note to start.';

function formatLastOpened(iso?: string): string {
	if (!iso) {
		return '';
	}
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return '';
	}
	return date.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

export function renderBooksTab(
	container: HTMLElement,
	deps: BooksTabViewDeps
): BooksTabViewHandle {
	const { app, services, context } = deps;
	let sortMode: BookSortMode = 'lastRead';
	let searchQuery = '';
	const coverUrls: string[] = [];
	let disposed = false;

	const toolbar = container.createDiv({ cls: 'speed-reader-books-toolbar' });
	const searchInput = toolbar.createEl('input', {
		cls: 'speed-reader-books-search',
		type: 'search',
		placeholder: 'Search title or path…'
	});
	const sortSelect = toolbar.createEl('select', { cls: 'speed-reader-books-sort' });
	for (const option of [
		{ value: 'lastRead', label: 'Last read' },
		{ value: 'title', label: 'Title' },
		{ value: 'progress', label: 'Progress %' }
	]) {
		sortSelect.createEl('option', { text: option.label, value: option.value });
	}
	sortSelect.value = sortMode;

	const listHost = container.createDiv({ cls: 'speed-reader-books-list' });

	const unsubscribers = [
		services.eventBus.on('epub-index-changed', () => void render()),
		services.eventBus.on('reading-state-changed', () => void render()),
		services.eventBus.on('book-cache-updated', () => void render())
	];

	searchInput.addEventListener('input', () => {
		searchQuery = searchInput.value;
		void render();
	});
	sortSelect.addEventListener('change', () => {
		sortMode = sortSelect.value as BookSortMode;
		void render();
	});

	async function loadCover(coverEl: HTMLElement, docKey: string): Promise<void> {
		if (disposed) {
			return;
		}
		const coverPath = bookCacheCoverPath(
			bookCacheBasePath(),
			docKey
		);
		try {
			const exists = await app.vault.adapter.exists(coverPath);
			if (!exists || disposed) {
				coverEl.addClass('speed-reader-books-row__cover--placeholder');
				return;
			}
			const bytes = await app.vault.adapter.readBinary(coverPath);
			const blob = new Blob([bytes], { type: 'image/jpeg' });
			const url = URL.createObjectURL(blob);
			coverUrls.push(url);
			if (disposed) {
				URL.revokeObjectURL(url);
				return;
			}
			coverEl.style.backgroundImage = `url("${url}")`;
			coverEl.removeClass('speed-reader-books-row__cover--placeholder');
		} catch {
			coverEl.addClass('speed-reader-books-row__cover--placeholder');
		}
	}

	function renderRow(parent: HTMLElement, row: BookHistoryRow): void {
		const rowEl = parent.createDiv({ cls: 'speed-reader-books-row' });
		rowEl.setAttribute('data-path', row.sourcePath);

		const pinBtn = rowEl.createEl('button', {
			cls: `speed-reader-history-pin${row.pinned ? ' is-pinned' : ''}`,
			attr: { type: 'button', 'aria-label': row.pinned ? 'Unpin' : 'Pin' }
		});
		pinBtn.innerHTML = row.pinned ? '★' : '☆';
		pinBtn.addEventListener('click', (event) => {
			event.stopPropagation();
			void toggleHistoryPin(services, row.sourcePath).then((ok) => {
				if (ok) {
					context.onStateChanged();
				}
			});
		});

		const coverEl = rowEl.createDiv({ cls: 'speed-reader-books-row__cover speed-reader-books-row__cover--placeholder' });
		void loadCover(coverEl, row.docKey);

		const metaEl = rowEl.createDiv({ cls: 'speed-reader-books-row__meta' });
		metaEl.createDiv({ cls: 'speed-reader-books-row__title', text: row.title });
		if (row.author) {
			metaEl.createDiv({ cls: 'speed-reader-books-row__author', text: row.author });
		}

		const progressEl = rowEl.createDiv({ cls: 'speed-reader-books-row__progress' });
		renderProgressRing(progressEl, row.progressPercent);

		const lastOpened = formatLastOpened(row.lastOpenedAt);
		if (lastOpened) {
			rowEl.createDiv({ cls: 'speed-reader-books-row__last-opened', text: lastOpened });
		}

		rowEl.addEventListener('click', () => {
			const state = services.readingStateStore.get(row.sourcePath);
			const initialPosition =
				state?.sourceKind === 'book' ? (state.position as BookPosition) : undefined;
			void services.readerGate
				.open({
					sourcePath: row.sourcePath,
					sourceKind: 'book',
					initialPosition
				})
				.catch((error: unknown) => {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Could not open EPUB: ${message}`);
				});
		});
	}

	function renderCollapsibleSection(
		parent: HTMLElement,
		title: string,
		rows: BookHistoryRow[],
		collapsedDefault = false
	): void {
		if (rows.length === 0) {
			return;
		}

		const section = parent.createDiv({ cls: 'speed-reader-books-section' });
		const header = section.createDiv({ cls: 'speed-reader-books-section__header' });
		header.createSpan({ cls: 'speed-reader-books-section__title', text: title });
		header.createSpan({
			cls: 'speed-reader-books-section__count',
			text: String(rows.length)
		});

		const body = section.createDiv({ cls: 'speed-reader-books-section__body' });
		if (collapsedDefault) {
			body.addClass('is-collapsed');
			header.addClass('is-collapsed');
		}

		header.addEventListener('click', () => {
			body.toggleClass('is-collapsed', !body.hasClass('is-collapsed'));
			header.toggleClass('is-collapsed', body.hasClass('is-collapsed'));
		});

		const groups = groupBookRowsByFolder(rows);
		for (const group of groups) {
			const groupEl = body.createDiv({ cls: 'speed-reader-books-folder' });
			const groupHeader = groupEl.createDiv({ cls: 'speed-reader-books-folder__header' });
			groupHeader.createSpan({
				cls: 'speed-reader-books-folder__name',
				text: group.folder === '/' ? 'Vault root' : group.folder
			});

			const groupBody = groupEl.createDiv({ cls: 'speed-reader-books-folder__body' });
			groupHeader.addEventListener('click', () => {
				groupBody.toggleClass('is-collapsed', !groupBody.hasClass('is-collapsed'));
				groupHeader.toggleClass('is-collapsed', groupBody.hasClass('is-collapsed'));
			});

			for (const row of group.rows) {
				renderRow(groupBody, row);
			}
		}
	}

	function showFilteredEmpty(mainHadRows: boolean): void {
		if (!mainHadRows) {
			return;
		}
		listHost.createDiv({
			cls: 'speed-reader-books-empty',
			text: FILTER_EMPTY_MESSAGE
		});
	}

	async function render(): Promise<void> {
		if (disposed) {
			return;
		}

		for (const url of coverUrls) {
			URL.revokeObjectURL(url);
		}
		coverUrls.length = 0;
		listHost.empty();

		const entries = services.epubVaultIndex.getAll();
		if (entries.length === 0) {
			listHost.createDiv({
				cls: 'speed-reader-books-empty',
				text: 'No EPUB files found. Add `.epub` files to your vault.'
			});
			return;
		}

		const model = await buildBookHistoryModel({
			entries,
			getReadingState: (sourcePath) => services.readingStateStore.get(sourcePath),
			getCachedIndex: (docKey) => services.bookCacheStore.get(docKey)
		});

		if (disposed) {
			return;
		}

		const filteredMain = applyHistoryFilters(model.main, context.filters);
		const mainRows = sortByPinnedFirst(
			sortBookRows(filterBookRowsBySearch(filteredMain, searchQuery), sortMode),
			(a, b) => {
				const aTime = a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : 0;
				const bTime = b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : 0;
				return bTime - aTime;
			}
		);

		const unreadRows = sortBookRows(
			filterBookRowsBySearch(model.unread, searchQuery),
			sortMode
		);

		if (mainRows.length === 0 && unreadRows.length === 0) {
			if (model.main.length > 0 || model.unread.length > 0) {
				showFilteredEmpty(model.main.length > 0);
			} else {
				listHost.createDiv({
					cls: 'speed-reader-books-empty',
					text: 'No EPUB files found. Add `.epub` files to your vault.'
				});
			}
			return;
		}

		renderCollapsibleSection(listHost, 'In library', mainRows, false);
		renderCollapsibleSection(listHost, 'Unread', unreadRows, false);
	}

	void render();

	return {
		refresh: () => void render(),
		destroy: () => {
			disposed = true;
			for (const unsub of unsubscribers) {
				unsub();
			}
			for (const url of coverUrls) {
				URL.revokeObjectURL(url);
			}
			coverUrls.length = 0;
			container.empty();
		}
	};
}
