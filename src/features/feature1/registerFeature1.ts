import { Notice, TFile, type Menu } from 'obsidian';
import type SpeedReaderAiPlugin from '../../main';
import type { PluginServices } from '../../services/serviceRegistry';

export function registerFeature1(plugin: SpeedReaderAiPlugin, services: PluginServices): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu: Menu, file) => {
			if (!(file instanceof TFile) || file.extension !== 'epub') {
				return;
			}

			menu.addItem((item) => {
				item
					.setTitle('Speed read EPUB')
					.setIcon('book-open')
					.onClick(() => {
						void openEpub(services, file.path);
					});
			});
		})
	);

	plugin.addCommand({
		id: 'speed-read-epub',
		name: 'Speed read EPUB',
		checkCallback: (checking: boolean) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || file.extension !== 'epub') {
				return false;
			}
			if (!checking) {
				void openEpub(services, file.path);
			}
			return true;
		}
	});
}

async function openEpub(services: PluginServices, sourcePath: string): Promise<void> {
	try {
		await services.readerGate.open({
			sourcePath,
			sourceKind: 'book'
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Could not open EPUB: ${message}`);
	}
}
