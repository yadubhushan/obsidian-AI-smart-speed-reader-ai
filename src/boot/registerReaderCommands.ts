import { Editor, MarkdownView, Menu, Notice, Plugin } from 'obsidian';
import type { SpeedReaderOpen } from '../ui/speedReaderOpen';
import type { ReaderTabId } from '../ui/readerShell/readerTabDock';

export interface ReaderCommandHost {
	startSpeedReading(view: MarkdownView, fromCursor?: boolean): void;
	openSpeedReader(open: SpeedReaderOpen): Promise<void>;
	openReaderPreferences(initialTab: ReaderTabId): Promise<void>;
}

/** Wires the ribbon icon, commands, and editor context menu to reader entry points. */
export function registerReaderCommands(plugin: Plugin, host: ReaderCommandHost): void {
	plugin.addRibbonIcon('book-open', 'Speed read current note', () => {
		const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			host.startSpeedReading(view);
		} else {
			new Notice('Open a note first');
		}
	});

	plugin.addCommand({
		id: 'start-speed-reading',
		name: 'Start speed reading',
		checkCallback: (checking: boolean) => {
			const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (markdownView) {
				if (!checking) {
					host.startSpeedReading(markdownView);
				}
				return true;
			}
			return false;
		}
	});

	plugin.addCommand({
		id: 'speed-read-selection',
		name: 'Speed read selected text',
		editorCheckCallback: (checking, editor) => {
			const selection = editor.getSelection();
			if (selection && selection.length > 0) {
				if (!checking) {
					void host.openSpeedReader({ kind: 'legacy', text: selection });
				}
				return true;
			}
			return false;
		}
	});

	plugin.addCommand({
		id: 'read-entire-note',
		name: 'Read entire note from cursor',
		checkCallback: (checking: boolean) => {
			const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (markdownView) {
				if (!checking) {
					host.startSpeedReading(markdownView, true);
				}
				return true;
			}
			return false;
		}
	});

	plugin.addCommand({
		id: 'open-speed-reader-preferences',
		name: 'Open speed reader preferences',
		callback: () => {
			void host.openReaderPreferences('settings');
		}
	});

	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
			const selection = editor.getSelection();
			if (!selection || selection.trim().length === 0) {
				return;
			}

			menu.addItem((item) => {
				item
					.setTitle('Read with speed reader')
					.setIcon('book-open')
					.onClick(() => {
						void host.openSpeedReader({ kind: 'legacy', text: selection });
					});
			});
		})
	);
}
