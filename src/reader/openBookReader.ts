import { Notice, type App } from 'obsidian';
import { createEpubParseProgressOverlay } from '../ui/epubParseProgress';
import { SpeedReaderAiModal } from '../speedReaderAiModal';
import type { EventBus } from '../services/eventBus';
import {
	attachBookReadingSession,
	prepareBookOpenState
} from '../features/feature2/registerFeature2';
import {
	bookPositionFromReadingState,
	bookPositionToEngineIndices,
	defaultBookPosition
} from '../formats/bookIndexToProcessedDocument';
import type { PreparePromptSet } from '../llm/promptCatalog';
import { createDefaultLlmModelCatalog } from '../llm/llmModelCatalog';
import { wireReaderBookmarks } from '../features/feature4/registerFeature4';
import { wireReaderWordLookup } from '../features/word-lookup/registerWordLookup';
import type { PluginServices } from '../services/serviceRegistry';
import type { BookCacheStore, BookPosition, OpenReaderRequest, ReadingStateStore } from '../types/m2Contracts';
import type { SpeedReaderAiSettings } from '../types';

export interface OpenBookReaderDeps {
	app: App;
	request: OpenReaderRequest;
	bookCacheStore: BookCacheStore;
	readingStateStore: ReadingStateStore;
	eventBus: EventBus;
	settings: SpeedReaderAiSettings;
	onSettingsChange: (settings: SpeedReaderAiSettings) => void;
	getSettings: () => SpeedReaderAiSettings;
	preparePrompts: PreparePromptSet;
	services: PluginServices;
	onClose?: (sourcePath: string) => void;
}

export async function openBookReader(deps: OpenBookReaderDeps): Promise<SpeedReaderAiModal> {
	const parseProgress = createEpubParseProgressOverlay();
	const index = await deps.bookCacheStore.ensureParsed(deps.request.sourcePath, {
		onProgress: (message) => {
			if (message) {
				parseProgress.show(message);
			} else {
				parseProgress.hide();
			}
		}
	});
	const { existingState, checksumReset } = await prepareBookOpenState({
		sourcePath: deps.request.sourcePath,
		sourceChecksum: index.sourceChecksum,
		services: deps.services
	});

	if (checksumReset) {
		new Notice('Book updated — starting from beginning');
	}

	const storedPosition =
		existingState?.sourceKind === 'book'
			? (existingState.position as BookPosition)
			: undefined;
	const initialPosition = checksumReset
		? defaultBookPosition(index)
		: bookPositionFromReadingState(
				index,
				(deps.request.initialPosition as BookPosition | undefined) ?? storedPosition
			);
	const { sectionIndex, tokenIndex } = bookPositionToEngineIndices(index, initialPosition);
	const playbackMode =
		deps.request.playbackMode ?? existingState?.playbackMode ?? deps.settings.reader.defaultPlaybackMode;

	const modal = new SpeedReaderAiModal(
		deps.app,
		{
			kind: 'book',
			sourcePath: deps.request.sourcePath,
			bookIndex: index,
			initialPosition,
			sectionIndex,
			tokenIndex
		},
		{ ...deps.settings },
		deps.onSettingsChange,
		undefined,
		deps.preparePrompts,
		undefined,
		() => deps.onClose?.(deps.request.sourcePath),
		createDefaultLlmModelCatalog(),
		deps.services.dataPaths.bookCacheBase
	);

	const hooks = attachBookReadingSession({
		modal,
		engine: modal.getEngine(),
		sourcePath: deps.request.sourcePath,
		bookIndex: index,
		existingState: checksumReset ? undefined : existingState,
		initialPlaybackMode: playbackMode,
		services: deps.services
	});
	modal.setSessionHooks(hooks);

	modal.open();
	modal.getEngine().setPlaybackMode(playbackMode);
	wireReaderWordLookup(deps.app, modal, () => ({
		dictionary: deps.getSettings().dictionary
	}));
	wireReaderBookmarks(modal, deps.services);
	deps.eventBus.emit('reader-opened', {
		sourcePath: deps.request.sourcePath,
		sourceKind: 'book'
	});
	return modal;
}
