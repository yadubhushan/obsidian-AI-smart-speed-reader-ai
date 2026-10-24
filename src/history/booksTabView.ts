import { Notice, type App } from 'obsidian';
import type { PluginServices } from '../services/serviceRegistry';
import type { BookPosition } from '../types/m2Contracts';
import {
	buildBookDashboardSections,
	buildBookHistoryModel,
	type BookHistoryRow
} from './historyListModel';
import type { HistoryModalContext } from './historyModalContext';
import { renderEmptyStateCard, renderLoadingSkeletonCards } from './dashboardCards';
import { renderBookShelf } from './bookGrid';
import { BookCoverUrlCache } from './bookCoverArt';
import { showBookActionsMenu, type BookActionsDeps } from './bookActionsMenu';
import type { EpubVaultEntry, ReadingStateFile } from '../types/m2Contracts';

export interface BooksTabViewHandle {
	destroy(): void;
	refresh(): void;
}

export interface BooksTabViewDeps {
	app: App;
	services: PluginServices;
	context: HistoryModalContext;
}

function buildBookEntriesWithCachedState(
	entries: EpubVaultEntry[],
	stateFile: ReadingStateFile
): EpubVaultEntry[] {
	const bySourcePath = new Map(entries.map((entry) => [entry.sourcePath, entry]));
	for (const state of Object.values(stateFile.sources)) {
		if (state.sourceKind !== 'book' || bySourcePath.has(state.sourcePath)) {
			continue;
		}
		bySourcePath.set(state.sourcePath, {
			sourcePath: state.sourcePath,
			title: state.title,
			folder: state.folder
		});
	}
	return Array.from(bySourcePath.values());
}

export function renderBooksTab(
	container: HTMLElement,
	deps: BooksTabViewDeps
): BooksTabViewHandle {
	const { app, services, context } = deps;
	const listHost = container.createDiv({ cls: 'speed-reader-dashboard-pane' });
	const coverUrls: string[] = [];
	let disposed = false;
	let hasRendered = false;
	let renderTimer: number | null = null;
	let renderGeneration = 0;
	const coverCache = new BookCoverUrlCache(app, services.dataPaths.bookCacheBase);

	// Reading-state events fire on every progress save while a book is open; coalesce them.
	function scheduleRender(): void {
		if (renderTimer !== null) {
			window.clearTimeout(renderTimer);
		}
		renderTimer = window.setTimeout(() => {
			renderTimer = null;
			void render();
		}, 250);
	}

	const unsubscribers = [
		services.eventBus.on('epub-index-changed', scheduleRender),
		services.eventBus.on('reading-state-changed', scheduleRender),
		services.eventBus.on('book-cache-updated', ({ docKey }) => {
			coverCache.invalidate(docKey);
			scheduleRender();
		}),
		services.eventBus.on('library-metadata-changed', scheduleRender)
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
		const generation = ++renderGeneration;

		if (!hasRendered) {
			listHost.empty();
			renderLoadingSkeletonCards(listHost, 3);
		}

		const stateFile = await services.readingStateStore.load();
		const vaultEntries = services.epubVaultIndex.getAll();
		const vaultPaths = new Set(vaultEntries.map((entry) => entry.sourcePath));
		const entries = buildBookEntriesWithCachedState(vaultEntries, stateFile);
		if (generation !== renderGeneration) {
			return;
		}
		if (entries.length === 0) {
			hasRendered = true;
			resetObjectUrls();
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
			getDisplayOverride: (sourcePath) => services.libraryMetadata.get(sourcePath),
			isInVault: (sourcePath) => vaultPaths.has(sourcePath),
			continueSourcePath: context.continueSourcePath
		});

		if (disposed || generation !== renderGeneration) {
			return;
		}

		const sections = buildBookDashboardSections(
			model,
			context.filters,
			context.searchQuery
		);

		// Swap content only once the new model is ready so refreshes don't flash skeletons.
		hasRendered = true;
		resetObjectUrls();
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

		const actions: BookActionsDeps = {
			app,
			services,
			onOpen: openBook,
			onChanged: () => context.onStateChanged()
		};
		for (const section of sections) {
			renderBookShelf(listHost, section, {
				app,
				services,
				coverUrls,
				coverCache,
				isDisposed: () => disposed,
				onOpen: openBook,
				onMenu: (row, event) => showBookActionsMenu(actions, row, event)
			});
		}
	}

	void render();

	return {
		refresh: () => void render(),
		destroy: () => {
			disposed = true;
			if (renderTimer !== null) {
				window.clearTimeout(renderTimer);
			}
			for (const unsub of unsubscribers) {
				unsub();
			}
			resetObjectUrls();
			coverCache.dispose();
			container.empty();
		}
	};
}
