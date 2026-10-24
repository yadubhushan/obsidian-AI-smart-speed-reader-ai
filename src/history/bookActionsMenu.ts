import { Menu, Notice, TFile, type App } from 'obsidian';
import type { PluginServices } from '../services/serviceRegistry';
import { openCoverPicker } from './coverPickerModal';
import { deleteHistoryItem } from './historyDeleteActions';
import type { BookMenuAnchor } from './bookGrid';
import type { BookHistoryRow } from './historyListModel';
import { toggleHistoryPin } from './historyPinActions';
import { promptRenameBook } from './renameBookModal';

export interface BookActionsDeps {
	app: App;
	services: PluginServices;
	onOpen: (row: BookHistoryRow) => void;
	/** Called after any action that changed reading state or files. */
	onChanged: () => void;
}

async function renameBook(deps: BookActionsDeps, row: BookHistoryRow): Promise<void> {
	const result = await promptRenameBook(deps.app, {
		title: row.title,
		author: row.author,
		originalTitle: row.originalTitle,
		originalAuthor: row.originalAuthor,
		hasCustomTitle: row.hasCustomTitle
	});
	if (!result) {
		return;
	}
	await deps.services.libraryMetadata.setDisplay(row.sourcePath, result);
}

async function markFinished(deps: BookActionsDeps, row: BookHistoryRow): Promise<void> {
	const state = deps.services.readingStateStore.get(row.sourcePath);
	if (!state) {
		return;
	}
	await deps.services.readingStateStore.upsert({
		...state,
		status: 'finished',
		progressPercent: 100
	});
	await deps.services.readingStateStore.flush();
	deps.onChanged();
}

async function resetProgress(deps: BookActionsDeps, row: BookHistoryRow): Promise<void> {
	const confirmed = confirm(
		`Reset progress for "${row.title}"? It moves back to Up next. Bookmarks and the cached book stay.`
	);
	if (!confirmed) {
		return;
	}
	await deps.services.readingStateStore.remove(row.sourcePath);
	await deps.services.readingStateStore.flush();
	deps.onChanged();
}

function revealInFileExplorer(app: App, row: BookHistoryRow): void {
	const file = app.vault.getAbstractFileByPath(row.sourcePath);
	if (!(file instanceof TFile)) {
		new Notice('That EPUB is no longer in the vault.');
		return;
	}
	const explorer = app.workspace.getLeavesOfType('file-explorer')[0];
	// Not in the public API, but stable across Obsidian releases.
	const view = explorer?.view as { revealInFolder?: (file: TFile) => void } | undefined;
	if (!explorer || !view?.revealInFolder) {
		new Notice(row.sourcePath);
		return;
	}
	void app.workspace.revealLeaf(explorer);
	view.revealInFolder(file);
}

function runAction(promise: Promise<void>, label: string): void {
	promise.catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Could not ${label}: ${message}`);
	});
}

export function showBookActionsMenu(
	deps: BookActionsDeps,
	row: BookHistoryRow,
	anchor: BookMenuAnchor
): void {
	const { app, services } = deps;
	const hasState = Boolean(services.readingStateStore.get(row.sourcePath));
	const menu = new Menu();

	menu.addItem((item) =>
		item
			.setTitle(row.status === 'in_progress' ? 'Resume' : 'Open')
			.setIcon('book-open')
			.onClick(() => deps.onOpen(row))
	);
	menu.addSeparator();
	menu.addItem((item) =>
		item
			.setTitle('Rename…')
			.setIcon('pencil')
			.onClick(() => runAction(renameBook(deps, row), 'rename book'))
	);
	menu.addItem((item) =>
		item
			.setTitle('Change cover…')
			.setIcon('image')
			.onClick(() =>
				openCoverPicker(app, services, {
					sourcePath: row.sourcePath,
					docKey: row.docKey,
					title: row.title,
					author: row.author
				})
			)
	);

	if (hasState) {
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle(row.pinned ? 'Unpin' : 'Pin')
				.setIcon(row.pinned ? 'pin-off' : 'pin')
				.onClick(() =>
					runAction(
						toggleHistoryPin(services, row.sourcePath).then((ok) => {
							if (ok) {
								deps.onChanged();
							}
						}),
						'pin book'
					)
				)
		);
		if (row.status !== 'finished') {
			menu.addItem((item) =>
				item
					.setTitle('Mark as finished')
					.setIcon('check-circle')
					.onClick(() => runAction(markFinished(deps, row), 'mark book finished'))
			);
		}
		menu.addItem((item) =>
			item
				.setTitle('Reset progress')
				.setIcon('rotate-ccw')
				.onClick(() => runAction(resetProgress(deps, row), 'reset progress'))
		);
	}

	menu.addSeparator();
	if (row.inVault) {
		menu.addItem((item) =>
			item
				.setTitle('Reveal in file explorer')
				.setIcon('folder-open')
				.onClick(() => revealInFileExplorer(app, row))
		);
	}
	menu.addItem((item) =>
		item
			.setTitle('Delete…')
			.setIcon('trash-2')
			.setWarning(true)
			.onClick(() =>
				runAction(
					deleteHistoryItem({
						app,
						services,
						sourcePath: row.sourcePath,
						title: row.title,
						surfaceKind: 'book'
					}).then((ok) => {
						if (ok) {
							deps.onChanged();
						}
					}),
					'delete book'
				)
			)
	);

	if (!(anchor instanceof MouseEvent)) {
		menu.showAtPosition(anchor);
		return;
	}
	if (anchor.type === 'click' && anchor.currentTarget instanceof HTMLElement && anchor.detail === 0) {
		// Keyboard activation: anchor under the button instead of at (0, 0).
		const rect = anchor.currentTarget.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom });
		return;
	}
	menu.showAtMouseEvent(anchor);
}
