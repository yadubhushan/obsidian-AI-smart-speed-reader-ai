import { Notice, Plugin, type App } from 'obsidian';
import { initAI } from '@obsidian-ai-providers/sdk';
import { initCursorCliDesktopSupport } from './llm/cursorCliDesktopBridge';
import { bootstrapLlmConfig } from './boot/llmConfigBootstrap';
import { PrepareStatusBar } from './boot/prepareStatusBar';
import { ReaderLauncher } from './boot/readerLauncher';
import { registerReaderCommands } from './boot/registerReaderCommands';
import { ReadingStateSyncCoordinator } from './boot/syncCoordinator';
import { registerFeature1 } from './features/feature1/registerFeature1';
import { registerFeature2 } from './features/feature2/registerFeature2';
import { registerFeature3A } from './features/feature3a/registerFeature3A';
import { registerFeature3B } from './features/feature3b/registerFeature3B';
import { registerFeature4 } from './features/feature4/registerFeature4';
import { registerStudyLoopBridge } from './study-loop/studyLoopBridge';
import { registerWordLookup } from './features/word-lookup/registerWordLookup';
import { DEFAULT_SETTINGS, SpeedReaderAiSettings, SpeedReaderAiSettingTab } from './settings';
import { createPluginServices, type PluginServices } from './services/serviceRegistry';
import { validateSettings } from './services/settingsValidator';
import {
	createDefaultLlmModelCatalog,
	loadLlmModelCatalogFromPath,
	type LlmModelCatalog
} from './llm/llmModelCatalog';
import { loadPreparePromptSet, type PreparePromptSet } from './llm/promptCatalog';
import { ManifestStore } from './store/ManifestStore';
import { migratePluginData } from './store/migratePluginData';
import { createPluginDataPaths, pluginReadCacheDisplayPath, type PluginDataPaths } from './store/pluginDataPaths';
import {
	pluginDataFromSettings,
	readingStateSyncFromPluginData,
	settingsFromPluginData,
	type ReadingStateSyncStamp
} from './store/pluginDataStorage';
import { listReadCacheDocKeys } from './store/readCachePaths';
import { createVaultManifestAdapter } from './store/vaultManifestAdapter';
import type { ReaderTabId } from './ui/readerShell/readerTabDock';

/**
 * Composition root: owns plugin-wide state (settings, catalogs, services)
 * and wires the collaborators that carry the actual behavior.
 */
export default class SpeedReaderAiPlugin extends Plugin {
	settings!: SpeedReaderAiSettings;
	dataPaths!: PluginDataPaths;
	llmModelCatalog: LlmModelCatalog = createDefaultLlmModelCatalog();
	llmModelsConfigPath = '';
	preparePrompts!: PreparePromptSet;
	private preparePromptsDirPath = '';
	private manifestStore: ManifestStore | null = null;
	private services: PluginServices | null = null;
	private pluginSettingTab: SpeedReaderAiSettingTab | null = null;
	private readingStateSync: ReadingStateSyncStamp | undefined;
	private prepareStatusBar: PrepareStatusBar | null = null;
	private readerLauncher!: ReaderLauncher;
	private readonly syncCoordinator = new ReadingStateSyncCoordinator({
		getStore: () => this.services?.readingStateStore ?? null,
		migrate: () =>
			migratePluginData(this.app.vault.adapter, this.app.vault.configDir, this.manifest.id)
	});

	async onload() {
		initAI(this.app, this, async () => undefined, { disableFallback: true });
		await initCursorCliDesktopSupport();

		const llmConfig = await bootstrapLlmConfig(
			this.app.vault.adapter,
			this.app.vault.configDir,
			this.manifest.id
		);
		this.llmModelsConfigPath = llmConfig.llmModelsConfigPath;
		this.llmModelCatalog = llmConfig.llmModelCatalog;
		this.preparePromptsDirPath = llmConfig.preparePromptsDirPath;
		this.preparePrompts = llmConfig.preparePrompts;

		await this.loadSettings();
		this.dataPaths = createPluginDataPaths(this.app.vault.configDir, this.manifest.id);
		const migration = await migratePluginData(
			this.app.vault.adapter,
			this.app.vault.configDir,
			this.manifest.id
		);
		if (migration.readCache || migration.bookCache || migration.readingState) {
			new Notice('Speed Reader data moved to plugin folder for sync.');
		}
		this.services = createPluginServices(this, this.dataPaths);
		this.services.eventBus.on('reading-state-flushed', () => {
			void this.bumpReadingStateSyncStamp();
		});
		registerFeature1(this, this.services);
		registerFeature2(this, this.services);
		registerFeature3A(this, this.services);
		registerFeature3B(this, this.services);
		registerFeature4(this, this.services);
		registerWordLookup(this);

		registerStudyLoopBridge({
			app: this.app,
			services: this.services,
			getSettings: () => this.settings
		});

		this.readerLauncher = new ReaderLauncher({
			app: this.app,
			getSettings: () => this.settings,
			persistSettings: (next) => this.persistValidatedSettings(next),
			getServices: () => this.getServices(),
			getManifestStore: () => this.getManifestStore(),
			getLlmModelCatalog: () => this.llmModelCatalog,
			getPreparePrompts: () => this.preparePrompts,
			refreshPrepareStatusBar: () => this.refreshPrepareStatusBar()
		});
		registerReaderCommands(this, this.readerLauncher);

		this.pluginSettingTab = new SpeedReaderAiSettingTab(this.app, this);
		this.addSettingTab(this.pluginSettingTab);

		this.prepareStatusBar = new PrepareStatusBar(this, () => this.getManifestStore());
		this.prepareStatusBar.attach();

		this.syncCoordinator.register(this);
	}

	onunload() {
		this.syncCoordinator.flushOnUnload();
		this.prepareStatusBar?.detach();
		this.prepareStatusBar = null;
		this.services = null;
	}

	onPrepareStatusChange(): void {
		void this.refreshPrepareStatusBar();
	}

	getServices(): PluginServices {
		if (!this.services) {
			this.services = createPluginServices(this, this.dataPaths);
		}
		return this.services;
	}

	getReadCacheBasePath(): string {
		return this.dataPaths.readCacheBase;
	}

	getReadCacheDisplayPath(): string {
		return pluginReadCacheDisplayPath(this.dataPaths);
	}

	getManifestStore(): ManifestStore {
		if (!this.manifestStore) {
			const base = this.getReadCacheBasePath();
			const vaultAdapter = this.app.vault.adapter;
			const adapter = createVaultManifestAdapter(vaultAdapter, base);
			this.manifestStore = new ManifestStore(adapter, '', {
				vaultAdapter,
				basePath: base
			});
		}
		return this.manifestStore;
	}

	async countCachedDocuments(): Promise<number> {
		const keys = await listReadCacheDocKeys(
			this.app.vault.adapter,
			this.getReadCacheBasePath()
		);
		return keys.length;
	}

	async clearAllReadCache(): Promise<number> {
		const count = await this.getManifestStore().clearAllDocumentCache();
		await this.refreshPrepareStatusBar();
		return count;
	}

	async reloadLlmModelCatalog(): Promise<void> {
		await this.reloadLlmModelCatalogFromDisk();
		this.settings.ai.llmModel = this.llmModelCatalog.normalize(this.settings.ai.llmModel);
		await this.saveSettings();
	}

	private async reloadLlmModelCatalogFromDisk(): Promise<void> {
		this.llmModelCatalog = await loadLlmModelCatalogFromPath(
			this.app.vault.adapter,
			this.llmModelsConfigPath
		);
	}

	private async reloadPreparePromptsFromDisk(): Promise<void> {
		if (!this.preparePromptsDirPath) {
			return;
		}
		this.preparePrompts = await loadPreparePromptSet(
			this.app.vault.adapter,
			this.preparePromptsDirPath
		);
	}

	async loadSettings() {
		const raw = await this.loadData();
		this.settings = settingsFromPluginData(raw, this.llmModelCatalog);
		this.readingStateSync = readingStateSyncFromPluginData(raw);
	}

	async saveSettings() {
		await this.saveData(pluginDataFromSettings(this.settings, this.readingStateSync));
	}

	private persistValidatedSettings(next: SpeedReaderAiSettings): void {
		this.settings = validateSettings(next, this.llmModelCatalog);
		void this.saveSettings();
	}

	async bumpReadingStateSyncStamp(): Promise<void> {
		this.readingStateSync = {
			revision: (this.readingStateSync?.revision ?? 0) + 1,
			updatedAt: new Date().toISOString()
		};
		await this.saveData(pluginDataFromSettings(this.settings, this.readingStateSync));
	}

	async onExternalSettingsChange(): Promise<void> {
		await this.reloadPluginDataFromSync();
	}

	/** Reload settings and plugin data files after Obsidian Sync updates the plugin folder. */
	async reloadPluginDataFromSync(): Promise<void> {
		await this.reloadLlmModelCatalogFromDisk();
		await this.loadSettings();
		await this.reloadPreparePromptsFromDisk();

		if (this.services) {
			await this.services.readingStateStore.reloadFromDisk();
		}

		this.refreshOpenSettingsTab();
		void this.refreshPrepareStatusBar();
	}

	/** Reload reading progress after sync or when the app returns to foreground. */
	async reloadReadingStateFromSync(): Promise<void> {
		await this.syncCoordinator.reloadFromSync();
	}

	private refreshOpenSettingsTab(): void {
		const tab = this.pluginSettingTab;
		if (!tab) {
			return;
		}
		const setting = (this.app as App & { setting?: { activeTab?: unknown } }).setting;
		if (setting?.activeTab === tab) {
			tab.display();
		}
	}

	async openReaderPreferences(initialTab: ReaderTabId = 'settings') {
		await this.readerLauncher.openReaderPreferences(initialTab);
	}

	async refreshPrepareStatusBar(): Promise<void> {
		await this.prepareStatusBar?.refresh();
	}
}
