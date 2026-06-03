import { Notice, type App } from 'obsidian';
import { docKeyFromSourcePath } from '../store/docKey';
import type { ManifestStore } from '../store/ManifestStore';
import type { PluginServices } from '../services/serviceRegistry';
import type { DashboardSurfaceKind } from './historyListModel';

export interface DeleteHistoryItemDeps {
	app: App;
	services: PluginServices;
	getManifestStore?: () => ManifestStore;
	sourcePath: string;
	title: string;
	surfaceKind: DashboardSurfaceKind;
}

function itemLabel(surfaceKind: DashboardSurfaceKind): string {
	return surfaceKind === 'book' ? 'book' : 'note';
}

export async function deleteHistoryItem(deps: DeleteHistoryItemDeps): Promise<boolean> {
	const label = itemLabel(deps.surfaceKind);
	const confirmed = confirm(
		`Delete ${label} "${deps.title}" from your vault and remove it from the reading dashboard?`
	);
	if (!confirmed) {
		return false;
	}

	const file = deps.app.vault.getAbstractFileByPath(deps.sourcePath);
	try {
		deps.services.readerGate.close();
		if (file) {
			await deps.app.vault.trash(file, true);
		}

		await deps.services.readingStateStore.remove(deps.sourcePath);
		await deps.services.readingStateStore.flush();

		if (deps.surfaceKind === 'book') {
			await deps.services.bookCacheStore.invalidate(docKeyFromSourcePath(deps.sourcePath));
		} else {
			await deps.getManifestStore?.().deleteDocumentCache(deps.sourcePath);
		}

		if (deps.surfaceKind === 'book') {
			deps.services.epubVaultIndex.refresh();
		}
		new Notice(`Deleted ${label}: ${deps.title}`);
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Could not delete ${label}: ${message}`);
		return false;
	}
}
