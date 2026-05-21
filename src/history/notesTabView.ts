import { Notice, type App } from 'obsidian';
import type { ManifestStore } from '../store/ManifestStore';
import type { PluginServices } from '../services/serviceRegistry';
import {
	applyHistoryFilters,
	sortByPinnedFirst
} from './historyFilters';
import {
	buildNoteHistoryModel,
	filterNoteRowsBySearch,
	groupNoteRowsByFolder,
	sortNoteRows,
	type BookSortMode,
	type NoteHistoryRow
} from './historyListModel';
import { toggleHistoryPin } from './historyPinActions';
import { renderProgressRing } from './progressRing';
import type { HistoryModalContext } from './historyModalContext';

export interface NotesTabViewHandle {
	destroy(): void;
	refresh(): void;
}

export interface NotesTabViewDeps {
	app: App;
	services: PluginServices;
	getManifestStore: () => ManifestStore;
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

export function renderNotesTab(
	container: HTMLElement,
	deps: NotesTabViewDeps
): NotesTabViewHandle {
	const { services, getManifestStore, context } = deps;
	let sortMode: BookSortMode = 'lastRead';
	let searchQuery = '';
	let disposed = false;

	const toolbar = container.createDiv({ cls: 'speed-reader-notes-toolbar' });
	const searchInput = toolbar.createEl('input', {
		cls: 'speed-reader-notes-search',
		type: 'search',
		placeholder: 'Search title or path…'
	});
	const sortSelect = toolbar.createEl('select', { cls: 'speed-reader-notes-sort' });
	for (const option of [
		{ value: 'lastRead', label: 'Last read' },
		{ value: 'title', label: 'Title' },
		{ value: 'progress', label: 'Progress %' }
	]) {
		sortSelect.createEl('option', { text: option.label, value: option.value });
	}
	sortSelect.value = sortMode;

	const listHost = container.createDiv({ cls: 'speed-reader-notes-list' });

	const unsubscribers = [
		services.eventBus.on('reading-state-changed', () => void render())
	];

	searchInput.addEventListener('input', () => {
		searchQuery = searchInput.value;
		void render();
	});
	sortSelect.addEventListener('change', () => {
		sortMode = sortSelect.value as BookSortMode;
		void render();
	});

	function renderRow(parent: HTMLElement, row: NoteHistoryRow): void {
		const rowEl = parent.createDiv({ cls: 'speed-reader-notes-row' });
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

		const metaEl = rowEl.createDiv({ cls: 'speed-reader-notes-row__meta' });
		const titleRow = metaEl.createDiv({ cls: 'speed-reader-notes-row__title-row' });
		titleRow.createDiv({ cls: 'speed-reader-notes-row__title', text: row.title });
		titleRow.createSpan({
			cls: `speed-reader-notes-row__badge speed-reader-notes-row__badge--${row.badge}`,
			text: row.badge === 'ai' ? 'AI ready' : 'Deterministic'
		});

		const progressEl = rowEl.createDiv({ cls: 'speed-reader-notes-row__progress' });
		renderProgressRing(progressEl, row.progressPercent);

		const lastOpened = formatLastOpened(row.lastOpenedAt);
		if (lastOpened) {
			rowEl.createDiv({ cls: 'speed-reader-notes-row__last-opened', text: lastOpened });
		}

		rowEl.addEventListener('click', () => {
			void services.readerGate
				.open({
					sourcePath: row.sourcePath,
					sourceKind: 'note',
					initialPosition: row.position
				})
				.catch((error: unknown) => {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Could not open note: ${message}`);
				});
		});
	}

	async function render(): Promise<void> {
		if (disposed) {
			return;
		}

		listHost.empty();
		const file = await services.readingStateStore.load();
		const rows = await buildNoteHistoryModel(file, (sourcePath) =>
			getManifestStore().getDocumentIndex(sourcePath)
		);

		if (disposed) {
			return;
		}

		const filtered = applyHistoryFilters(rows, context.filters);
		const searched = filterNoteRowsBySearch(filtered, searchQuery);
		const sorted = sortByPinnedFirst(
			sortNoteRows(searched, sortMode),
			(a, b) => {
				const aTime = a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : 0;
				const bTime = b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : 0;
				return bTime - aTime;
			}
		);

		if (sorted.length === 0) {
			const hasAnyNotes = rows.length > 0;
			listHost.createDiv({
				cls: 'speed-reader-notes-empty',
				text: hasAnyNotes ? FILTER_EMPTY_MESSAGE : FILTER_EMPTY_MESSAGE
			});
			return;
		}

		const groups = groupNoteRowsByFolder(sorted);
		for (const group of groups) {
			const groupEl = listHost.createDiv({ cls: 'speed-reader-notes-folder' });
			const groupHeader = groupEl.createDiv({ cls: 'speed-reader-notes-folder__header' });
			groupHeader.createSpan({
				cls: 'speed-reader-notes-folder__name',
				text: group.folder === '/' ? 'Vault root' : group.folder
			});

			const groupBody = groupEl.createDiv({ cls: 'speed-reader-notes-folder__body' });
			groupHeader.addEventListener('click', () => {
				groupBody.toggleClass('is-collapsed', !groupBody.hasClass('is-collapsed'));
				groupHeader.toggleClass('is-collapsed', groupBody.hasClass('is-collapsed'));
			});

			for (const row of group.rows) {
				renderRow(groupBody, row);
			}
		}
	}

	void render();

	return {
		refresh: () => void render(),
		destroy: () => {
			disposed = true;
			for (const unsub of unsubscribers) {
				unsub();
			}
			container.empty();
		}
	};
}
