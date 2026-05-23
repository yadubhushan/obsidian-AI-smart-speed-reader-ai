import { EventBus } from './eventBus';
import type { SpeedReaderPluginHost } from './pluginHost';
import { SettingsBackedLlmClient, isLlmBackendConfigured } from '../llm/createLlmClient';
import { canResolveCursorCliDesktop } from '../llm/cursorCliDesktopBridge';
import { getAiProvidersApi } from '../llm/aiProvidersBridge';
import { validateSettings } from './settingsValidator';
import { BookCacheStoreImpl } from '../store/BookCacheStore';
import type { BookCacheStore } from '../types/m2Contracts';
import { ReadingStateStoreImpl } from '../store/ReadingStateStore';
import type { ReadingStateStore } from '../types/m2Contracts';
import { createReaderGate, type ReaderGateImpl } from '../reader/ReaderGate';
import { createEpubSourceFormatProcessor } from '../formats/epub/epubSourceFormatProcessor';
import type { EpubVaultIndex, SourceFormatProcessor } from '../types/m2Contracts';
import type { PluginDataPaths } from '../store/pluginDataPaths';
import { registerSourceFormatProcessor } from '../formats/sourceFormatProcessorRegistry';
import { createEpubVaultIndex, type EpubVaultIndexImpl } from '../history/epubVaultIndex';
import { createBookmarkService, type BookmarkService } from '../bookmarks/bookmarkService';

export interface PluginServices {
	eventBus: EventBus;
	dataPaths: PluginDataPaths;
	readingStateStore: ReadingStateStore;
	bookCacheStore: BookCacheStore;
	readerGate: ReaderGateImpl;
	epubProcessor: SourceFormatProcessor;
	epubVaultIndex: EpubVaultIndex;
	bookmarkService: BookmarkService;
}

export function createPluginServices(
	plugin: SpeedReaderPluginHost,
	dataPaths: PluginDataPaths
): PluginServices {
	const eventBus = new EventBus();
	const readingStateStore = ReadingStateStoreImpl.create(
		plugin.app,
		eventBus,
		dataPaths.readingStateFile
	);
	void readingStateStore.load();
	const epubProcessor = createEpubSourceFormatProcessor(plugin.app);
	registerSourceFormatProcessor(epubProcessor);
	const bookCacheStore = new BookCacheStoreImpl(
		plugin.app,
		epubProcessor,
		eventBus,
		dataPaths.bookCacheBase,
		() => {
			if (!isLlmBackendConfigured(plugin.settings)) {
				return undefined;
			}
			return new SettingsBackedLlmClient({
				getSettings: () => plugin.settings,
				getAiProviders: () => getAiProvidersApi(plugin.app),
				canResolveCursorCli: (path) => canResolveCursorCliDesktop(path)
			});
		}
	);
	const epubVaultIndex: EpubVaultIndexImpl = createEpubVaultIndex(plugin.app, eventBus);
	const bookmarkService = createBookmarkService({
		app: plugin.app,
		getSettings: () => plugin.settings
	});
	const services: PluginServices = {
		eventBus,
		dataPaths,
		readingStateStore,
		bookCacheStore,
		readerGate: null as unknown as ReaderGateImpl,
		epubProcessor,
		epubVaultIndex,
		bookmarkService
	};
	services.readerGate = createReaderGate({
		app: plugin.app,
		eventBus,
		bookCacheStore,
		readingStateStore,
		services,
		getSettings: () => plugin.settings,
		onSettingsChange: (newSettings) => {
			plugin.settings = validateSettings(newSettings, plugin.llmModelCatalog);
			void plugin.saveSettings();
		},
		preparePrompts: plugin.preparePrompts,
		getManifestStore: () => plugin.getManifestStore(),
		onPrepareStatusChange: () => plugin.onPrepareStatusChange?.()
	});

	return services;
}
