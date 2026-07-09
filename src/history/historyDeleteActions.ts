import { Modal, Notice, type App } from 'obsidian';
import { docKeyFromSourcePath } from '../store/docKey';
import type { ManifestStore } from '../store/ManifestStore';
import type { PluginServices } from '../services/serviceRegistry';
import type { DashboardSurfaceKind } from './historyListModel';
import { ensureBookCoverAssetsBeforeEpubDelete } from './bookCoverLookup';

export interface DeleteHistoryItemDeps {
	app: App;
	services: PluginServices;
	getManifestStore?: () => ManifestStore;
	sourcePath: string;
	title: string;
	surfaceKind: DashboardSurfaceKind;
}

type BookDeleteChoice = 'epub-only' | 'everything';

function itemLabel(surfaceKind: DashboardSurfaceKind): string {
	return surfaceKind === 'book' ? 'book' : 'note';
}

class BookDeleteChoiceModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly title: string,
		private readonly resolveChoice: (choice: BookDeleteChoice | null) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass('speed-reader-delete-choice-modal');
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Delete book' });
		contentEl.createEl('p', {
			text: `Choose what to delete for "${this.title}".`
		});
		contentEl.createEl('p', {
			text: 'Deleting only the EPUB keeps reading progress, bookmarks, cover art, and parsed book data.'
		});

		const actions = contentEl.createDiv({ cls: 'speed-reader-delete-choice-actions' });
		const epubOnly = actions.createEl('button', {
			cls: 'mod-cta',
			text: 'Delete EPUB only',
			attr: { type: 'button' }
		});
		epubOnly.addEventListener('click', () => this.choose('epub-only'));

		const everything = actions.createEl('button', {
			cls: 'mod-warning',
			text: 'Delete everything',
			attr: { type: 'button' }
		});
		everything.addEventListener('click', () => this.choose('everything'));

		const cancel = actions.createEl('button', {
			text: 'Cancel',
			attr: { type: 'button' }
		});
		cancel.addEventListener('click', () => this.choose(null));
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolved = true;
			this.resolveChoice(null);
		}
	}

	private choose(choice: BookDeleteChoice | null): void {
		if (this.resolved) {
			return;
		}
		this.resolved = true;
		this.resolveChoice(choice);
		this.close();
	}
}

function chooseBookDeleteMode(app: App, title: string): Promise<BookDeleteChoice | null> {
	return new Promise((resolve) => {
		new BookDeleteChoiceModal(app, title, resolve).open();
	});
}

export async function deleteHistoryItem(deps: DeleteHistoryItemDeps): Promise<boolean> {
	const label = itemLabel(deps.surfaceKind);
	const deleteChoice =
		deps.surfaceKind === 'book' ? await chooseBookDeleteMode(deps.app, deps.title) : null;
	if (deps.surfaceKind === 'book') {
		if (!deleteChoice) {
			return false;
		}
	} else {
		const confirmed = confirm(
			`Delete ${label} "${deps.title}" from your vault and remove it from the reading dashboard?`
		);
		if (!confirmed) {
			return false;
		}
	}

	const file = deps.app.vault.getAbstractFileByPath(deps.sourcePath);
	try {
		deps.services.readerGate.close();
		if (deps.surfaceKind === 'book' && deleteChoice === 'epub-only') {
			const index = await deps.services.bookCacheStore.ensureParsed(deps.sourcePath);
			const coverResult = await ensureBookCoverAssetsBeforeEpubDelete(
				deps.app,
				deps.services.dataPaths.bookCacheBase,
				index
			);
			if (coverResult.options.length > 0 && coverResult.wroteCover) {
				new Notice(`Fetched cover for: ${deps.title}`);
			}
		}

		if (file) {
			await deps.app.vault.trash(file, true);
		}

		if (deps.surfaceKind === 'book' && deleteChoice === 'epub-only') {
			deps.services.epubVaultIndex.refresh();
			new Notice(
				file
					? `Deleted EPUB file only: ${deps.title}`
					: `EPUB file already missing; kept cached book data: ${deps.title}`
			);
			return true;
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
