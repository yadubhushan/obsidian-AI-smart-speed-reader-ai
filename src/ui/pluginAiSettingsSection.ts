import { App, Notice, Setting } from 'obsidian';
import type SpeedReaderAiPlugin from '../main';
import { DEFAULT_SETTINGS } from '../types';
import { runAiProvidersSmokeTest } from '../llm/AiProvidersLlmClient';
import { getAiProvidersApi } from '../llm/aiProvidersBridge';
import {
	MIN_PREPARE_SINGLE_CALL_MAX_CHARS,
	MIN_PREPARE_SINGLE_CALL_MAX_LINES,
	MIN_TIMEOUT_SECONDS,
	parsePrepareSingleCallMaxCharsFromInput,
	parsePrepareSingleCallMaxLinesFromInput,
	parseTimeoutSecondsFromInput
} from '../services/settingsValidator';

const BUTTON_SMOKE_AI_PROVIDERS_LABEL = 'Test AI Providers connection';

export interface PluginAiSettingsHost {
	app: App;
	plugin: SpeedReaderAiPlugin;
	refreshDisplay: () => void;
}

export function displayPluginAiSettings(host: PluginAiSettingsHost, containerEl: HTMLElement): void {
	const { plugin } = host;

	containerEl.createEl('h3', { text: 'AI prepare' });
	containerEl.createEl('p', {
		text:
			'AI prepare runs through the AI Providers community plugin, which holds your API keys and models. ' +
			'Note text is sent to the provider you select.',
		cls: 'setting-item-description'
	});

	// Rendered async; its own container keeps it above the limits below.
	void displayAiProvidersSettings(host, containerEl.createDiv());

	containerEl.createEl('h4', { text: 'Prepare limits' });

	new Setting(containerEl)
		.setName('LLM timeout (seconds)')
		.setDesc(`How long to wait for each LLM response before failing (minimum ${MIN_TIMEOUT_SECONDS}).`)
		.addText((text) =>
			text
				.setPlaceholder(String(DEFAULT_SETTINGS.ai.timeoutSeconds))
				.setValue(String(plugin.settings.ai.timeoutSeconds))
				.onChange(async (value) => {
					const n = parseTimeoutSecondsFromInput(value);
					if (n === null) {
						new Notice(`Timeout must be an integer ≥ ${MIN_TIMEOUT_SECONDS}.`, 5000);
						text.setValue(String(plugin.settings.ai.timeoutSeconds));
						return;
					}
					plugin.settings.ai.timeoutSeconds = n;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName('Prepare single-call max chars')
		.setDesc(
			`Above this payload size, prepare uses batched LLM calls (minimum ${MIN_PREPARE_SINGLE_CALL_MAX_CHARS}).`
		)
		.addText((text) =>
			text
				.setPlaceholder(String(DEFAULT_SETTINGS.ai.prepareSingleCallMaxChars))
				.setValue(String(plugin.settings.ai.prepareSingleCallMaxChars))
				.onChange(async (value) => {
					const n = parsePrepareSingleCallMaxCharsFromInput(value);
					if (n === null) {
						new Notice(
							`Max chars must be an integer ≥ ${MIN_PREPARE_SINGLE_CALL_MAX_CHARS}.`,
							5000
						);
						text.setValue(String(plugin.settings.ai.prepareSingleCallMaxChars));
						return;
					}
					plugin.settings.ai.prepareSingleCallMaxChars = n;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName('Prepare single-call max lines')
		.setDesc(
			`Above this line count, prepare uses batched LLM calls (minimum ${MIN_PREPARE_SINGLE_CALL_MAX_LINES}).`
		)
		.addText((text) =>
			text
				.setPlaceholder(String(DEFAULT_SETTINGS.ai.prepareSingleCallMaxLines))
				.setValue(String(plugin.settings.ai.prepareSingleCallMaxLines))
				.onChange(async (value) => {
					const n = parsePrepareSingleCallMaxLinesFromInput(value);
					if (n === null) {
						new Notice(
							`Max lines must be an integer ≥ ${MIN_PREPARE_SINGLE_CALL_MAX_LINES}.`,
							5000
						);
						text.setValue(String(plugin.settings.ai.prepareSingleCallMaxLines));
						return;
					}
					plugin.settings.ai.prepareSingleCallMaxLines = n;
					await plugin.saveSettings();
				})
		);

	void displayReadCacheClearSetting(host, containerEl);
}

async function displayAiProvidersSettings(
	host: PluginAiSettingsHost,
	containerEl: HTMLElement
): Promise<void> {
	const { app, plugin } = host;
	containerEl.createEl('h4', { text: 'Obsidian AI Providers' });
	const aiProviders = await getAiProvidersApi(app);
	if (!aiProviders || aiProviders.providers.length === 0) {
		containerEl.createEl('p', {
			text: 'Install and configure the AI Providers community plugin (Settings → Community plugins → AI Providers).',
			cls: 'setting-item-description'
		});
		return;
	}

	const options: Record<string, string> = { '': 'Select a provider…' };
	for (const provider of aiProviders.providers) {
		const label = provider.model
			? `${provider.name} (${provider.model})`
			: provider.name;
		options[provider.id] = label;
	}

	new Setting(containerEl)
		.setName('AI Providers entry')
		.setDesc('Uses keys configured in the AI Providers plugin.')
		.addDropdown((drop) =>
			drop
				.addOptions(options)
				.setValue(plugin.settings.ai.aiProvidersProviderId)
				.onChange(async (value) => {
					plugin.settings.ai.aiProvidersProviderId = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName('Model override')
		.setDesc("Optional model id. Leave empty to use the provider's own model.")
		.addText((text) =>
			text
				.setPlaceholder('Provider default')
				.setValue(plugin.settings.ai.aiProvidersModelOverride)
				.onChange(async (value) => {
					plugin.settings.ai.aiProvidersModelOverride = value.trim();
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName('Test AI Providers connection')
		.setDesc('Runs a minimal ping prompt through the selected AI Providers entry.')
		.addButton((btn) =>
			btn.setButtonText(BUTTON_SMOKE_AI_PROVIDERS_LABEL).onClick(async () => {
				btn.setDisabled(true);
				btn.setButtonText('Calling…');
				try {
					const r = await runAiProvidersSmokeTest({
						providerId: plugin.settings.ai.aiProvidersProviderId,
						modelOverride: plugin.settings.ai.aiProvidersModelOverride,
						timeoutSeconds: plugin.settings.ai.timeoutSeconds,
						getAiProviders: () => getAiProvidersApi(app)
					});
					if (r.ok) {
						new Notice(`AI Providers OK: ${summarizeSmokeStdout(r.stdout)}`, 16000);
					} else {
						new Notice(r.message, 16000);
					}
				} catch (e: unknown) {
					const msg =
						e instanceof Error ? e.message : `Smoke test crashed: ${String(e)}`;
					new Notice(msg, 16000);
				} finally {
					btn.setButtonText(BUTTON_SMOKE_AI_PROVIDERS_LABEL);
					btn.setDisabled(false);
				}
			})
		);
}

async function displayReadCacheClearSetting(
	host: PluginAiSettingsHost,
	containerEl: HTMLElement
): Promise<void> {
	const { plugin } = host;
	const cachePath = plugin.getReadCacheDisplayPath();
	const count = await plugin.countCachedDocuments();
	const countLabel = count === 1 ? '1 cached document' : `${count} cached documents`;

	new Setting(containerEl)
		.setName('Clear all AI prepare cache')
		.setDesc(
			`Stored at \`${cachePath}\` (${countLabel}). ` +
				'Removes all prepare output for every note. Plugin settings and prompts are not affected.'
		)
		.addButton((btn) =>
			btn.setButtonText('Clear all cache').setWarning().onClick(async () => {
				const confirmed = confirm(
					'Remove all AI prepare cache for every note? You can prepare again later.'
				);
				if (!confirmed) {
					return;
				}
				btn.setDisabled(true);
				try {
					const removed = await plugin.clearAllReadCache();
					if (removed > 0) {
						new Notice(`Cleared AI prepare cache for ${removed} document(s).`);
					} else {
						new Notice('No AI prepare cache found.');
					}
					host.refreshDisplay();
				} finally {
					btn.setDisabled(false);
				}
			})
		);
}

function summarizeSmokeStdout(raw: string, maxChars = 360): string {
	const stripped = raw
		.replace(/\uFEFF/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!stripped.length) {
		return '(empty stdout)';
	}
	return stripped.length <= maxChars ? stripped : `${stripped.slice(0, maxChars)}…`;
}
