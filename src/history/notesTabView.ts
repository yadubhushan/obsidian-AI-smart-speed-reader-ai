import { Notice, type App } from 'obsidian';
import type { ManifestStore } from '../store/ManifestStore';
import type { PluginServices } from '../services/serviceRegistry';
import { docKeyFromSourcePath } from '../store/docKey';
import {
	buildNoteDashboardSections,
	buildNoteHistoryModel,
	type NoteHistoryRow
} from './historyListModel';
import { toggleHistoryPin } from './historyPinActions';
import type { HistoryModalContext } from './historyModalContext';
import {
	renderEmptyStateCard,
	renderLoadingSkeletonCards,
	renderReadingShelf
} from './dashboardCards';
import { deleteHistoryItem } from './historyDeleteActions';

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

export function renderNotesTab(
	container: HTMLElement,
	deps: NotesTabViewDeps
): NotesTabViewHandle {
	const { services, getManifestStore, context } = deps;
	const listHost = container.createDiv({ cls: 'speed-reader-dashboard-pane' });
	let disposed = false;

	const unsubscribers = [
		services.eventBus.on('reading-state-changed', () => void render())
	];

	async function getProcessedDocumentSummary(sourcePath: string) {
		const store = getManifestStore();
		const index = await store.getDocumentIndex(sourcePath);
		if (!index) {
			return null;
		}
		const docKey = docKeyFromSourcePath(sourcePath);
		const versionId = index.activeVersionId ?? index.versions[0]?.id ?? null;
		return store.loadProcessedDocument(docKey, index.activeProcessingMode, versionId);
	}

	function openNote(row: NoteHistoryRow): void {
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
	}

	async function render(): Promise<void> {
		if (disposed) {
			return;
		}

		listHost.empty();
		renderLoadingSkeletonCards(listHost, 3);

		const file = await services.readingStateStore.load();
		const rows = await buildNoteHistoryModel(
			file,
			(sourcePath) => getManifestStore().getDocumentIndex(sourcePath),
			(sourcePath) => getProcessedDocumentSummary(sourcePath),
			context.continueSourcePath
		);

		if (disposed) {
			return;
		}

		const sections = buildNoteDashboardSections(
			rows,
			context.filters,
			context.searchQuery
		);

		listHost.empty();
		if (sections.length === 0) {
			renderEmptyStateCard(
				listHost,
				rows.length > 0 ? 'No notes match this view' : 'No notes yet',
				rows.length > 0
					? 'Try a different filter or search term to find the note you want to revisit.'
					: 'Read a note with Speed Reader AI and it will appear here automatically.'
			);
			return;
		}

		for (const section of sections) {
			renderReadingShelf(listHost, section, {
				app: deps.app,
				services,
				coverUrls: [],
				isDisposed: () => disposed,
				onOpen: (row) => openNote(row as NoteHistoryRow),
				onTogglePin: (row) => {
					void toggleHistoryPin(services, row.sourcePath).then((ok) => {
						if (ok) {
							context.onStateChanged();
						}
					});
				},
				onDelete: (row) => {
					void deleteHistoryItem({
						app: deps.app,
						services,
						getManifestStore,
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
			container.empty();
		}
	};
}
