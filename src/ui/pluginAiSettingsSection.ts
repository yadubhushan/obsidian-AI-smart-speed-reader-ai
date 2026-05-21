import { App, Notice, Platform, Setting } from 'obsidian';
import type SpeedReaderAiPlugin from '../main';
import { DEFAULT_SETTINGS } from '../types';
import {
	detectCursorExecutable,
	runCursorCliSmokeTest
} from '../llm/CursorCliClient';
import { runAiProvidersSmokeTest } from '../llm/AiProvidersLlmClient';
import { getAiProvidersApi } from '../llm/aiProvidersBridge';
import { describeActiveLlmBackend } from '../llm/createLlmClient';
import {
	API_PROVIDER_PRESETS,
	resolveApiBaseUrl,
	runOpenAiCompatibleSmokeTest
} from '../llm/OpenAiCompatibleClient';
import {
	MIN_PREPARE_SINGLE_CALL_MAX_CHARS,
	MIN_PREPARE_SINGLE_CALL_MAX_LINES,
	MIN_TIMEOUT_SECONDS,
	parsePrepareSingleCallMaxCharsFromInput,
	parsePrepareSingleCallMaxLinesFromInput,
	parseTimeoutSecondsFromInput
} from '../services/settingsValidator';
import { speedReaderReadCacheDisplayPath } from '../store/speedReaderVaultPaths';

const BUTTON_SMOKE_CURSOR_LABEL = 'Test Cursor CLI connection';
const BUTTON_SMOKE_API_LABEL = 'Test API connection';
const BUTTON_SMOKE_AI_PROVIDERS_LABEL = 'Test AI Providers connection';

export interface PluginAiSettingsHost {
	app: App;
	plugin: SpeedReaderAiPlugin;
	refreshDisplay: () => void;
}

export function displayPluginAiSettings(host: PluginAiSettingsHost, containerEl: HTMLElement): void {
	const { app, plugin } = host;
	const catalog = plugin.llmModelCatalog;
	const ai = plugin.settings.ai;
	const backend = ai.llmBackend;
	const showCursor = backend === 'auto' || backend === 'cursor-cli';
	const showAiProviders = backend === 'auto' || backend === 'ai-providers';
	const showApi = backend === 'auto' || backend === 'openai-compatible';

	containerEl.createEl('h3', { text: 'AI prepare' });

	new Setting(containerEl)
		.setName('LLM backend')
		.setDesc(
			`Active: ${describeActiveLlmBackend(plugin.settings)}. ` +
				'Auto uses Cursor CLI on desktop when available, otherwise AI Providers, then API key.'
		)
		.addDropdown((drop) =>
			drop
				.addOption('auto', 'Auto (recommended)')
				.addOption('cursor-cli', 'Cursor CLI (desktop)')
				.addOption('ai-providers', 'Obsidian AI Providers')
				.addOption('openai-compatible', 'API key (OpenAI / OpenRouter)')
				.setValue(ai.llmBackend)
				.onChange(async (value) => {
					plugin.settings.ai.llmBackend =
						value === 'cursor-cli' ||
						value === 'ai-providers' ||
						value === 'openai-compatible'
							? value
							: 'auto';
					await plugin.saveSettings();
					host.refreshDisplay();
				})
		);

	if (showCursor) {
		containerEl.createEl('h4', { text: 'Cursor CLI' });
		if (!Platform.isDesktopApp) {
			containerEl.createEl('p', {
				text: 'Cursor CLI is not available on mobile. Configure AI Providers or an API key below.',
				cls: 'setting-item-description'
			});
		}

		new Setting(containerEl)
			.setName('LLM model')
			.setDesc(
				`Cursor agent model for AI prepare. Edit the list in \`${plugin.llmModelsConfigPath}\` ` +
					'(ids are passed to Cursor CLI `--model`). Also used as model override for AI Providers.'
			)
			.addDropdown((drop) => {
				for (const opt of catalog.options) {
					drop.addOption(opt.id, opt.label);
				}
				drop
					.setValue(catalog.normalize(ai.llmModel))
					.onChange(async (value) => {
						plugin.settings.ai.llmModel = catalog.normalize(value);
						await plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Reload model list')
			.setDesc('Re-read llm-models.json after you edit it.')
			.addButton((btn) =>
				btn.setButtonText('Reload from config').onClick(async () => {
					btn.setDisabled(true);
					try {
						await plugin.reloadLlmModelCatalog();
						new Notice(
							`Loaded ${plugin.llmModelCatalog.options.length} model(s) from config.`,
							8000
						);
						host.refreshDisplay();
					} catch (e: unknown) {
						const msg =
							e instanceof Error ? e.message : `Reload failed: ${String(e)}`;
						new Notice(msg, 12000);
					} finally {
						btn.setDisabled(false);
					}
				})
			);

		new Setting(containerEl)
			.setName('Cursor CLI path')
			.setDesc(
				'Absolute path to the `cursor` or `cursor-agent` binary. ' +
					'Obsidian often has a minimal PATH (unlike Terminal), so leave this empty only if `which cursor` works from a bare login shell. ' +
					'Example: /Users/you/.local/bin/cursor'
			)
			.addText((text) =>
				text
					.setPlaceholder('e.g. /Users/you/.local/bin/cursor')
					.setValue(ai.cursorCliPath)
					.onChange(async (value) => {
						plugin.settings.ai.cursorCliPath = value.trim();
						await plugin.saveSettings();
						const p = plugin.settings.ai.cursorCliPath;
						if (!p.length) {
							return;
						}
						try {
							detectCursorExecutable(p);
						} catch {
							new Notice(
								'Could not resolve Cursor CLI at this path (setting saved). ' +
									'Install the CLI or fix the path, then use Resolve to verify.',
								11000
							);
						}
					})
			);

		new Setting(containerEl)
			.setName('Locate Cursor CLI executable')
			.setDesc('Only checks filesystem / PATH resolution (instant). Does not call the agent.')
			.addButton((btn) =>
				btn.setButtonText('Resolve').onClick(() => {
					try {
						const configured = plugin.settings.ai.cursorCliPath.trim();
						const exe = detectCursorExecutable(
							configured.length ? configured : undefined
						);
						new Notice(`OK — using: ${exe}`, 10000);
					} catch (e: unknown) {
						const msg =
							e instanceof Error ? e.message : `Resolution failed: ${String(e)}`;
						new Notice(msg, 14000);
					}
				})
			);

		new Setting(containerEl)
			.setName('Test Cursor CLI connection')
			.setDesc(
				'Runs a minimal ping prompt through the Cursor agent. Uses a capped timeout (30–120s).'
			)
			.addButton((btn) =>
				btn.setButtonText(BUTTON_SMOKE_CURSOR_LABEL).onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText('Calling…');
					try {
						const path = plugin.settings.ai.cursorCliPath.trim();
						const r = await runCursorCliSmokeTest({
							cursorCliPath: path.length ? path : undefined,
							model: plugin.settings.ai.llmModel,
							timeoutSeconds: plugin.settings.ai.timeoutSeconds
						});
						if (r.ok) {
							const trimmed = summarizeSmokeStdout(r.stdout);
							const normalized = trimmed.toUpperCase();
							const hinted = normalized.includes('SPEED_READER_PING_OK')
								? '(response contains ping token)'
								: '(unexpected format — check Cursor output)';
							new Notice(
								`LLM OK ${hinted}\n(${r.timeoutSecondsUsed}s timeout) ${trimmed}`,
								16000
							);
						} else {
							const pathHint = path.length
								? `\nConfigured path: ${path}`
								: '\nNo path configured — check PATH or set cursorCliPath.';
							new Notice(`${r.message}${pathHint}`, 16000);
						}
					} catch (e: unknown) {
						const msg =
							e instanceof Error ? e.message : `Smoke test crashed: ${String(e)}`;
						new Notice(msg, 16000);
					} finally {
						btn.setButtonText(BUTTON_SMOKE_CURSOR_LABEL);
						btn.setDisabled(false);
					}
				})
			);
	}

	if (showAiProviders) {
		void displayAiProvidersSettings(host, containerEl);
	}

	if (showApi) {
		containerEl.createEl('h4', { text: 'API key' });
		containerEl.createEl('p', {
			text: 'Sends note text to the configured provider during AI prepare. Keys are stored locally in plugin settings.',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('API provider preset')
			.setDesc('OpenAI and OpenRouter use standard chat completion endpoints.')
			.addDropdown((drop) =>
				drop
					.addOption('openai', API_PROVIDER_PRESETS.openai.label)
					.addOption('openrouter', API_PROVIDER_PRESETS.openrouter.label)
					.addOption('custom', 'Custom base URL')
					.setValue(ai.apiProviderPreset)
					.onChange(async (value) => {
						plugin.settings.ai.apiProviderPreset =
							value === 'openrouter' || value === 'custom' ? value : 'openai';
						await plugin.saveSettings();
						host.refreshDisplay();
					})
			);

		if (plugin.settings.ai.apiProviderPreset === 'custom') {
			new Setting(containerEl)
				.setName('Custom API base URL')
				.setDesc('Example: https://api.example.com/v1')
				.addText((text) =>
					text
						.setPlaceholder('https://api.example.com/v1')
						.setValue(plugin.settings.ai.apiBaseUrl)
						.onChange(async (value) => {
							plugin.settings.ai.apiBaseUrl = value.trim();
							await plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName('API key')
			.setDesc('Bearer token for the selected provider.')
			.addText((text) => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('sk-…')
					.setValue(plugin.settings.ai.apiKey)
					.onChange(async (value) => {
						plugin.settings.ai.apiKey = value;
						await plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('API model')
			.setDesc('Model id passed to chat/completions (e.g. gpt-4o-mini, anthropic/claude-3.5-sonnet).')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.ai.apiModel)
					.setValue(plugin.settings.ai.apiModel)
					.onChange(async (value) => {
						plugin.settings.ai.apiModel = value.trim();
						await plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Test API connection')
			.setDesc('Runs a minimal ping prompt through the configured API.')
			.addButton((btn) =>
				btn.setButtonText(BUTTON_SMOKE_API_LABEL).onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText('Calling…');
					try {
						const baseUrl = resolveApiBaseUrl(
							plugin.settings.ai.apiProviderPreset,
							plugin.settings.ai.apiBaseUrl
						);
						const r = await runOpenAiCompatibleSmokeTest({
							apiKey: plugin.settings.ai.apiKey,
							model: plugin.settings.ai.apiModel,
							baseUrl,
							preset: plugin.settings.ai.apiProviderPreset,
							timeoutSeconds: plugin.settings.ai.timeoutSeconds
						});
						if (r.ok) {
							const trimmed = summarizeSmokeStdout(r.stdout);
							new Notice(`API OK: ${trimmed}`, 16000);
						} else {
							new Notice(r.message, 16000);
						}
					} catch (e: unknown) {
						const msg =
							e instanceof Error ? e.message : `Smoke test crashed: ${String(e)}`;
						new Notice(msg, 16000);
					} finally {
						btn.setButtonText(BUTTON_SMOKE_API_LABEL);
						btn.setDisabled(false);
					}
				})
			);
	}

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
			`Above this payload size, prepare uses batched CLI calls (minimum ${MIN_PREPARE_SINGLE_CALL_MAX_CHARS}).`
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
			`Above this line count, prepare uses batched CLI calls (minimum ${MIN_PREPARE_SINGLE_CALL_MAX_LINES}).`
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
		.setName('Test AI Providers connection')
		.setDesc('Runs a minimal ping prompt through the selected AI Providers entry.')
		.addButton((btn) =>
			btn.setButtonText(BUTTON_SMOKE_AI_PROVIDERS_LABEL).onClick(async () => {
				btn.setDisabled(true);
				btn.setButtonText('Calling…');
				try {
					const r = await runAiProvidersSmokeTest({
						providerId: plugin.settings.ai.aiProvidersProviderId,
						modelOverride: plugin.settings.ai.llmModel,
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
	const cachePath = speedReaderReadCacheDisplayPath();
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
