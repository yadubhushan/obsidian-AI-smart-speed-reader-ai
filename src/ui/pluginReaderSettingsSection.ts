import { Setting } from 'obsidian';
import type SpeedReaderAiPlugin from '../main';

export interface PluginReaderSettingsHost {
	plugin: SpeedReaderAiPlugin;
}

export function displayPluginReaderPacingSettings(
	host: PluginReaderSettingsHost,
	containerEl: HTMLElement
): void {
	const { plugin } = host;

	containerEl.createEl('h3', { text: 'Pacing' });

	new Setting(containerEl)
		.setName('Enable micropause')
		.setDesc('Add extra pause on punctuation, paragraph breaks, and headings.')
		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.reader.enableMicropause).onChange(async (value) => {
				plugin.settings.reader.enableMicropause = value;
				await plugin.saveSettings();
			});
		});

	new Setting(containerEl)
		.setName('Micropause intensity')
		.setDesc('Multiplier strength for micropauses (1–3).')
		.addSlider((slider) => {
			slider
				.setLimits(1, 3, 0.1)
				.setValue(plugin.settings.reader.micropauseIntensity)
				.setDynamicTooltip()
				.onChange(async (value) => {
					plugin.settings.reader.micropauseIntensity = value;
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName('Line repeat gap (ms)')
		.setDesc('Pause between line repeats in Line Repeat playback mode.')
		.addText((text) => {
			text
				.setPlaceholder('600')
				.setValue(String(plugin.settings.reader.lineRepeatGapMs))
				.onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (!Number.isFinite(parsed)) {
						return;
					}
					plugin.settings.reader.lineRepeatGapMs = parsed;
					await plugin.saveSettings();
				});
		});
}

export function displayPluginReaderBookmarkSettings(
	host: PluginReaderSettingsHost,
	containerEl: HTMLElement
): void {
	const { plugin } = host;

	containerEl.createEl('h3', { text: 'Bookmarks' });

	new Setting(containerEl)
		.setName('Book bookmark note template')
		.setDesc('Vault path template for EPUB bookmarks. Must include {book_name}.')
		.addText((text) => {
			text
				.setPlaceholder('docs/Areas/books/bookmarks/{book_name}.md')
				.setValue(plugin.settings.bookmarks.bookBookmarkNoteTemplate)
				.onChange(async (value) => {
					plugin.settings.bookmarks.bookBookmarkNoteTemplate = value;
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName('Note bookmark section heading')
		.setDesc('Markdown heading appended when saving note bookmarks.')
		.addText((text) => {
			text
				.setPlaceholder('Speed Reader Bookmarks')
				.setValue(plugin.settings.bookmarks.noteBookmarkSectionHeading)
				.onChange(async (value) => {
					plugin.settings.bookmarks.noteBookmarkSectionHeading = value;
					await plugin.saveSettings();
				});
		});
}
