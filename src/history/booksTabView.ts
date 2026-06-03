import { Notice, type App } from 'obsidian';
import type { PluginServices } from '../services/serviceRegistry';
import type { BookPosition } from '../types/m2Contracts';
import {
	buildBookDashboardSections,
	buildBookHistoryModel,
	type BookHistoryRow
} from './historyListModel';
import { toggleHistoryPin } from './historyPinActions';
import type { HistoryModalContext } from './historyModalContext';
import {
	renderEmptyStateCard,
	renderLoadingSkeletonCards,
	renderReadingShelf
} from './dashboardCards';
import { deleteHistoryItem } from './historyDeleteActions';

export interface BooksTabViewHandle {
	destroy(): void;
	refresh(): void;
}

export interface BooksTabViewDeps {
	app: App;
	services: PluginServices;
	context: HistoryModalContext;
}

export function renderBooksTab(
	container: HTMLElement,
	deps: BooksTabViewDeps
): BooksTabViewHandle {
	const { app, services, context } = deps;
	const listHost = container.createDiv({ cls: 'speed-reader-dashboard-pane' });
	const coverUrls: string[] = [];
	let disposed = false;

	const unsubscribers = [
		services.eventBus.on('epub-index-changed', () => void render()),
		services.eventBus.on('reading-state-changed', () => void render()),
		services.eventBus.on('book-cache-updated', () => void render())
	];

	function resetObjectUrls(): void {
		for (const url of coverUrls) {
			URL.revokeObjectURL(url);
		}
		coverUrls.length = 0;
	}

	function openBook(row: BookHistoryRow): void {
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
	}

	async function render(): Promise<void> {
		if (disposed) {
			return;
		}

		resetObjectUrls();
		listHost.empty();
		renderLoadingSkeletonCards(listHost, 3);

		const entries = services.epubVaultIndex.getAll();
		if (entries.length === 0) {
			listHost.empty();
			renderEmptyStateCard(
				listHost,
				'No books in your library yet',
				'Add EPUB files to the vault to build your reading dashboard.'
			);
			return;
		}

		const model = await buildBookHistoryModel({
			entries,
			getReadingState: (sourcePath) => services.readingStateStore.get(sourcePath),
			getCachedIndex: (docKey) => services.bookCacheStore.get(docKey),
			continueSourcePath: context.continueSourcePath
		});

		if (disposed) {
			return;
		}

		const sections = buildBookDashboardSections(
			model,
			context.filters,
			context.searchQuery
		);

		listHost.empty();
		if (sections.length === 0) {
			const hasBooks = model.main.length > 0 || model.unread.length > 0;
			renderEmptyStateCard(
				listHost,
				hasBooks ? 'No books match this view' : 'No books in your library yet',
				hasBooks
					? 'Try a different filter or search term to uncover something to read next.'
					: 'Add EPUB files to the vault to build your reading dashboard.'
			);
			return;
		}

		for (const section of sections) {
			renderReadingShelf(listHost, section, {
				app,
				services,
				coverUrls,
				isDisposed: () => disposed,
				onOpen: (row) => openBook(row as BookHistoryRow),
				onTogglePin: (row) => {
					void toggleHistoryPin(services, row.sourcePath).then((ok) => {
						if (ok) {
							context.onStateChanged();
						}
					});
				},
				onDelete: (row) => {
					void deleteHistoryItem({
						app,
						services,
						sourcePath: row.sourcePath,
						title: row.title,
						surfaceKind: row.surfaceKind
					}).then((ok) => {
						if (ok) {
							context.onStateChanged();
							void render();
						}
					});
				}
			});
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
			resetObjectUrls();
			container.empty();
		}
	};
}
