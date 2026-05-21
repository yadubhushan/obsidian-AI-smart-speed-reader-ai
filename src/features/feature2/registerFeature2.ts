import type SpeedReaderAiPlugin from '../../main';
import type { PluginServices } from '../../services/serviceRegistry';
import type { SpeedReaderAiModal } from '../../speedReaderAiModal';
import type { RSVPEngine } from '../../engine/rsvpEngine';
import type {
	BookCacheIndex,
	PlaybackMode,
	ReadingState,
	SourceKind
} from '../../types/m2Contracts';
import { createSaveScheduler } from '../../reader/saveScheduler';
import {
	createReadingProgressTracker,
	type ReadingProgressTracker,
	resolveBookTitle,
	resolveNoteTitle
} from '../../reader/readingProgressTracker';
import type { ReaderSessionHooks } from '../../reader/readingProgressTracker';

export interface ActiveReadingSession {
	modal: SpeedReaderAiModal;
	tracker: ReadingProgressTracker;
}

let activeSession: ActiveReadingSession | null = null;

export function registerFeature2(_plugin: SpeedReaderAiPlugin, services: PluginServices): void {
	void services.readingStateStore.load();

	services.eventBus.on('reader-closed', () => {
		void teardownActiveSession();
	});
}

export function attachBookReadingSession(deps: {
	modal: SpeedReaderAiModal;
	engine: RSVPEngine;
	sourcePath: string;
	bookIndex: BookCacheIndex;
	existingState?: ReadingState;
	initialPlaybackMode?: PlaybackMode;
	services: PluginServices;
}): ReaderSessionHooks {
	return attachSession({
		modal: deps.modal,
		engine: deps.engine,
		sourcePath: deps.sourcePath,
		sourceKind: 'book',
		title: resolveBookTitle(deps.bookIndex, deps.sourcePath),
		sourceChecksum: deps.bookIndex.sourceChecksum,
		author: deps.bookIndex.author,
		bookIndex: deps.bookIndex,
		existingState: deps.existingState,
		initialPlaybackMode: deps.initialPlaybackMode,
		services: deps.services
	});
}

export function attachNoteReadingSession(deps: {
	modal: SpeedReaderAiModal;
	engine: RSVPEngine;
	sourcePath: string;
	sourceChecksum: string;
	preferredProcessingMode?: 'sections' | 'single_story';
	existingState?: ReadingState;
	initialPlaybackMode?: PlaybackMode;
	services: PluginServices;
}): ReaderSessionHooks {
	return attachSession({
		modal: deps.modal,
		engine: deps.engine,
		sourcePath: deps.sourcePath,
		sourceKind: 'note',
		title: resolveNoteTitle(deps.sourcePath),
		sourceChecksum: deps.sourceChecksum,
		preferredProcessingMode: deps.preferredProcessingMode,
		existingState: deps.existingState,
		initialPlaybackMode: deps.initialPlaybackMode,
		services: deps.services
	});
}

function attachSession(deps: {
	modal: SpeedReaderAiModal;
	engine: RSVPEngine;
	sourcePath: string;
	sourceKind: SourceKind;
	title: string;
	sourceChecksum: string;
	author?: string;
	preferredProcessingMode?: 'sections' | 'single_story';
	bookIndex?: BookCacheIndex;
	existingState?: ReadingState;
	initialPlaybackMode?: PlaybackMode;
	services: PluginServices;
}): ReaderSessionHooks {
	void teardownActiveSession();

	const scheduler = createSaveScheduler(deps.services.readingStateStore);
	const tracker = createReadingProgressTracker({
		sourcePath: deps.sourcePath,
		sourceKind: deps.sourceKind,
		title: deps.title,
		sourceChecksum: deps.sourceChecksum,
		author: deps.author,
		preferredProcessingMode: deps.preferredProcessingMode,
		bookIndex: deps.bookIndex,
		initialPlaybackMode: deps.initialPlaybackMode,
		engine: deps.engine,
		readingStateStore: deps.services.readingStateStore,
		scheduler,
		existingState: deps.existingState
	});

	activeSession = { modal: deps.modal, tracker };
	return tracker.getHooks();
}

async function teardownActiveSession(): Promise<void> {
	if (!activeSession) {
		return;
	}
	const session = activeSession;
	activeSession = null;
	await session.tracker.destroy();
}

export async function prepareBookOpenState(deps: {
	sourcePath: string;
	sourceChecksum: string;
	services: PluginServices;
}): Promise<{ existingState?: ReadingState; checksumReset: boolean }> {
	await deps.services.readingStateStore.load();
	const existing = deps.services.readingStateStore.get(deps.sourcePath);
	const checksumReset = Boolean(
		existing?.sourceChecksum && existing.sourceChecksum !== deps.sourceChecksum
	);
	await deps.services.readingStateStore.setLastGlobal(deps.sourcePath);
	await deps.services.readingStateStore.flush();
	return { existingState: checksumReset ? undefined : existing, checksumReset };
}

export async function prepareNoteOpenState(deps: {
	sourcePath: string;
	sourceChecksum: string;
	services: PluginServices;
}): Promise<{ existingState?: ReadingState; checksumReset: boolean }> {
	return prepareBookOpenState(deps);
}
