import { Notice } from 'obsidian';
import type SpeedReaderAiPlugin from '../../main';
import type { PluginServices } from '../../services/serviceRegistry';
import { continueReading } from '../../history/continueReading';
import { activateLibraryView, LIBRARY_VIEW_TYPE, LibraryView } from '../../history/libraryView';

export function registerFeature3B(plugin: SpeedReaderAiPlugin, services: PluginServices): void {
	plugin.registerView(
		LIBRARY_VIEW_TYPE,
		(leaf) =>
			new LibraryView(leaf, {
				services,
				getManifestStore: () => plugin.getManifestStore()
			})
	);

	const openLibrary = () => {
		void activateLibraryView(plugin.app);
	};

	plugin.addRibbonIcon('library', 'Open library', openLibrary);

	plugin.addCommand({
		id: 'open-reading-history',
		name: 'Open library',
		callback: openLibrary
	});

	plugin.addCommand({
		id: 'continue-reading',
		name: 'Continue reading',
		callback: () => {
			void continueReading({
				app: plugin.app,
				services
			}).then((ok) => {
				if (!ok) {
					new Notice('No recent reading session.');
				}
			});
		}
	});
}
