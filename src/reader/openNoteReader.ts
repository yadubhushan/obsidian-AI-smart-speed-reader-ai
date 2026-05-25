import { Notice, type App } from 'obsidian';
import { noteContentChecksum } from '../crypto-checksum';
import { SpeedReaderAiModal } from '../speedReaderAiModal';
import type { EventBus } from '../services/eventBus';
import {
	attachNoteReadingSession,
	prepareNoteOpenState
} from '../features/feature2/registerFeature2';
import type { PreparePromptSet } from '../llm/promptCatalog';
import { wireReaderBookmarks } from '../features/feature4/registerFeature4';
import { wireReaderWordLookup } from '../features/word-lookup/registerWordLookup';
import type { PluginServices } from '../services/serviceRegistry';
import type { ManifestStore } from '../store/ManifestStore';
import type {
	NotePosition,
	OpenReaderRequest,
	ReadingStateStore
} from '../types/m2Contracts';
import type { SpeedReaderAiSettings } from '../types';

export interface OpenNoteReaderDeps {
	app: App;
	request: OpenReaderRequest;
	readingStateStore: ReadingStateStore;
	eventBus: EventBus;
	settings: SpeedReaderAiSettings;
	onSettingsChange: (settings: SpeedReaderAiSettings) => void;
	getSettings: () => SpeedReaderAiSettings;
	preparePrompts: PreparePromptSet;
	getManifestStore: () => ManifestStore;
	services: PluginServices;
	onClose?: (sourcePath: string) => void;
	onPrepareStatusChange?: () => void;
}

export async function openNoteReader(deps: OpenNoteReaderDeps): Promise<SpeedReaderAiModal> {
	const file = deps.app.vault.getFileByPath(deps.request.sourcePath);
	if (!file) {
		throw new Error(`Note not found: ${deps.request.sourcePath}`);
	}

	const text = await deps.app.vault.read(file);
	const checksum = await noteContentChecksum(
		text,
		deps.settings.bookmarks.noteBookmarkSectionHeading
	);

	const { existingState, checksumReset } = await prepareNoteOpenState({
		sourcePath: deps.request.sourcePath,
		sourceChecksum: checksum,
		services: deps.services
	});

	if (checksumReset) {
		new Notice('Book updated — starting from beginning');
	}

	const requestPosition = deps.request.initialPosition as NotePosition | undefined;
	const storedPosition =
		!checksumReset && existingState?.sourceKind === 'note'
			? (existingState.position as NotePosition)
			: undefined;
	const resumePosition = requestPosition ?? storedPosition;

	const modal = new SpeedReaderAiModal(
		deps.app,
		{
			kind: 'structured',
			sourcePath: deps.request.sourcePath,
			text,
			checksum,
			resumePosition,
			preferredProcessingMode: existingState?.preferredProcessingMode,
			preferredAiVersionId: existingState?.preferredAiVersionId
		},
		{ ...deps.settings },
		deps.onSettingsChange,
		deps.getManifestStore(),
		deps.preparePrompts,
		deps.onPrepareStatusChange,
		() => deps.onClose?.(deps.request.sourcePath)
	);

	const playbackMode =
		deps.request.playbackMode ?? existingState?.playbackMode ?? deps.settings.reader.defaultPlaybackMode;

	const hooks = attachNoteReadingSession({
		modal,
		engine: modal.getEngine(),
		sourcePath: deps.request.sourcePath,
		sourceChecksum: checksum,
		preferredProcessingMode: existingState?.preferredProcessingMode,
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
		sourceKind: 'note'
	});
	return modal;
}
