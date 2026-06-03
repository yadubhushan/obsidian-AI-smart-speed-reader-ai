import { App, PluginSettingTab, Setting } from 'obsidian';
import type SpeedReaderAiPlugin from './main';
import type { SpeedReaderAiSettings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { displayPluginAiSettings } from './ui/pluginAiSettingsSection';
import { displayPluginDictionarySettings } from './ui/pluginDictionarySettingsSection';
import {
	displayPluginReaderBookmarkSettings,
	displayPluginReaderPacingSettings
} from './ui/pluginReaderSettingsSection';

export { DEFAULT_SETTINGS };
export type { SpeedReaderAiSettings };

export class SpeedReaderAiSettingTab extends PluginSettingTab {
	plugin: SpeedReaderAiPlugin;

	constructor(app: App, plugin: SpeedReaderAiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Speed Reader AI' });
		containerEl.createEl('p', {
			text: 'RSVP reading with optional AI prepare for notes, EPUB books, bookmarks, and dictionary lookup.'
		});

		displayPluginAiSettings(
			{
				app: this.app,
				plugin: this.plugin,
				refreshDisplay: () => this.display()
			},
			containerEl
		);

		displayPluginDictionarySettings({ plugin: this.plugin }, containerEl);

		displayPluginReaderPacingSettings({ plugin: this.plugin }, containerEl);
		displayPluginReaderBookmarkSettings({ plugin: this.plugin }, containerEl);

		containerEl.createEl('h3', { text: 'Reader' });

		new Setting(containerEl)
			.setName('Reader preferences')
			.setDesc('Display, pacing, and playback options in the in-reader Settings tab.')
			.addButton((btn) =>
				btn.setButtonText('Open speed reader preferences').onClick(() => {
					void this.plugin.openReaderPreferences('settings');
				})
			);

		new Setting(containerEl)
			.setName('Reading Dashboard')
			.setDesc('Browse what to read next, what is pinned, and what you have finished.')
			.addButton((btn) =>
				btn.setButtonText('Open reading dashboard').onClick(() => {
					(this.app as App & { commands: { executeCommandById(id: string): void } }).commands.executeCommandById(
						'speed-reader-ai:open-reading-history'
					);
				})
			);
	}
}
