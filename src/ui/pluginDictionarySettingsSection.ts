import { Setting } from 'obsidian';
import type SpeedReaderAiPlugin from '../main';

export interface PluginDictionarySettingsHost {
	plugin: SpeedReaderAiPlugin;
}

export function displayPluginDictionarySettings(
	host: PluginDictionarySettingsHost,
	containerEl: HTMLElement
): void {
	const { plugin } = host;

	containerEl.createEl('h3', { text: 'Dictionary' });

	containerEl.createEl('p', {
		cls: 'setting-item-description',
		text:
			'Optional Merriam Webster Collegiate Dictionary API key. When set, word lookup uses Merriam Webster first. ' +
			'When empty, free sources are used (no key required). Only the looked-up word is sent to the API.'
	});

	new Setting(containerEl)
		.setName('Merriam Webster API key')
		.setDesc(
			'Register for a free key at dictionaryapi.com (1000 requests/day non-commercial). ' +
			'Docs: Collegiate Dictionary API and JSON format.'
		)
		.addText((text) => {
			text.inputEl.type = 'password';
			text
				.setPlaceholder('Your dictionary API key')
				.setValue(plugin.settings.dictionary.merriamWebsterApiKey)
				.onChange(async (value) => {
					plugin.settings.dictionary.merriamWebsterApiKey = value.trim();
					await plugin.saveSettings();
				});
		});

	const links = containerEl.createEl('p', { cls: 'setting-item-description' });
	links.createEl('a', {
		text: 'Register for an API key',
		href: 'https://dictionaryapi.com/register/index'
	});
	links.appendText(' · ');
	links.createEl('a', {
		text: 'Collegiate Dictionary API',
		href: 'https://dictionaryapi.com/products/api-collegiate-dictionary'
	});
	links.appendText(' · ');
	links.createEl('a', {
		text: 'JSON documentation',
		href: 'https://dictionaryapi.com/products/json'
	});
}
