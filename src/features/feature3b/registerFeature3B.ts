import { Notice } from 'obsidian';
import type SpeedReaderAiPlugin from '../../main';
import type { PluginServices } from '../../services/serviceRegistry';
import { continueReading } from '../../history/continueReading';
import { openReadingHistoryModal } from '../../history/ReadingHistoryModal';

export function registerFeature3B(plugin: SpeedReaderAiPlugin, services: PluginServices): void {
	const openHistory = () => {
		openReadingHistoryModal({
			app: plugin.app,
			services,
			getManifestStore: () => plugin.getManifestStore()
		});
	};

	plugin.addRibbonIcon('library', 'Open reading history', openHistory);

	plugin.addCommand({
		id: 'open-reading-history',
		name: 'Open reading history',
		callback: openHistory
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
