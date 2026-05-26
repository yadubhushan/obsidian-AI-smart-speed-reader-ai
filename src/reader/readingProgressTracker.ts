import { navWordsFromStream, wordIndexForSeekIndex } from '../engine/readingNavigation';
import type { RSVPEngine } from '../engine/rsvpEngine';
import type { ReaderState } from '../types';
import type {
	BookCacheIndex,
	BookPosition,
	NotePosition,
	PlaybackMode,
	ReadingState,
	ReadingStateStore,
	SourceKind
} from '../types/m2Contracts';
import {
	basenameFromPath,
	bookPositionFromEngine,
	computeProgressPercent,
	notePositionFromEngine,
	parentFolderFromPath,
	statusFromProgressPercent
} from './readingProgress';
import type { SaveScheduler } from './saveScheduler';

export const PERIODIC_FLUSH_MS = 30_000;

export interface ReaderSessionHooks {
	onEngineStateChange?(state: ReaderState, previousIsPlaying: boolean | null): void;
	onSectionChange?(sectionId: string): void;
}

export interface ReadingProgressTrackerDeps {
	sourcePath: string;
	sourceKind: SourceKind;
	title: string;
	sourceChecksum: string;
	author?: string;
	preferredProcessingMode?: 'sections' | 'single_story';
	bookIndex?: BookCacheIndex;
	initialPlaybackMode?: PlaybackMode;
	engine: RSVPEngine;
	readingStateStore: ReadingStateStore;
	scheduler: SaveScheduler;
	existingState?: ReadingState;
}

export interface ReadingProgressTracker {
	destroy(): Promise<void>;
	getHooks(): ReaderSessionHooks;
}

export function createReadingProgressTracker(
	deps: ReadingProgressTrackerDeps
): ReadingProgressTracker {
	let lastIsPlaying: boolean | null = null;
	let lastSectionId: string | null = null;
	let lastState: ReaderState | null = null;
	let periodicFlushTimer: ReturnType<typeof setInterval> | null = null;

	const clearPeriodicFlush = () => {
		if (periodicFlushTimer !== null) {
			clearInterval(periodicFlushTimer);
			periodicFlushTimer = null;
		}
	};

	const startPeriodicFlush = () => {
		if (periodicFlushTimer !== null) {
			return;
		}
		periodicFlushTimer = setInterval(() => {
			if (lastState?.isPlaying) {
				void deps.scheduler.flushNow();
			}
		}, PERIODIC_FLUSH_MS);
	};

	const resolveSectionId = (state: ReaderState): string | undefined => {
		const sections = deps.engine.getSectionList();
		if (sections.length === 0) {
			return undefined;
		}
		return sections[state.currentSectionIndex ?? 0]?.id;
	};

	const resolvePosition = (state: ReaderState): BookPosition | NotePosition => {
		const sectionId = resolveSectionId(state);
		const tokenIndex = state.currentTokenIndex ?? state.currentIndex;

		if (deps.sourceKind === 'book' && deps.bookIndex) {
			const processed = deps.engine.getLoadedProcessedDocument();
			const navWords =
				processed && processed.kind === 'sections'
					? navWordsFromStream(processed.sections[state.currentSectionIndex ?? 0]?.stream ?? [])
					: [];
			const wordIndex =
				navWords.length > 0
					? wordIndexForSeekIndex(navWords, tokenIndex)
					: tokenIndex;
			return bookPositionFromEngine(deps.bookIndex, sectionId, wordIndex);
		}

		const processed = deps.engine.getLoadedProcessedDocument();
		if (!processed) {
			return { sectionId: sectionId ?? 'section-01', wordIndex: tokenIndex };
		}
		return notePositionFromEngine(processed, sectionId, tokenIndex);
	};

	const buildReadingState = (state: ReaderState): ReadingState => {
		const position = resolvePosition(state);
		const processed = deps.engine.getLoadedProcessedDocument() ?? undefined;
		const progressPercent = computeProgressPercent({
			sourceKind: deps.sourceKind,
			bookIndex: deps.bookIndex,
			processed,
			position
		});

		return {
			sourcePath: deps.sourcePath,
			sourceKind: deps.sourceKind,
			title: deps.title,
			author: deps.author ?? deps.existingState?.author,
			folder: parentFolderFromPath(deps.sourcePath),
			sourceChecksum: deps.sourceChecksum,
			lastOpenedAt: new Date().toISOString(),
			pinned: deps.existingState?.pinned ?? false,
			pinnedAt: deps.existingState?.pinnedAt,
			status: statusFromProgressPercent(progressPercent),
			playbackMode: deps.engine.getPlaybackMode(),
			position,
			progressPercent,
			preferredProcessingMode:
				deps.preferredProcessingMode ?? deps.existingState?.preferredProcessingMode
		};
	};

	const persistState = async (state: ReaderState, immediate: boolean) => {
		const readingState = buildReadingState(state);
		await deps.readingStateStore.upsert(readingState);
		if (immediate) {
			await deps.scheduler.flushNow();
		} else {
			deps.scheduler.scheduleSave();
		}
	};

	const hooks: ReaderSessionHooks = {
		onEngineStateChange(state, previousIsPlaying) {
			lastState = state;
			const sectionId = resolveSectionId(state);
			if (sectionId && lastSectionId !== null && sectionId !== lastSectionId) {
				void persistState(state, true);
			}
			if (sectionId) {
				lastSectionId = sectionId;
			}

			const paused = previousIsPlaying === true && !state.isPlaying;
			if (paused) {
				clearPeriodicFlush();
				void persistState(state, true);
			} else if (state.isPlaying) {
				startPeriodicFlush();
				void persistState(state, false);
			}

			lastIsPlaying = state.isPlaying;
		},

		onSectionChange(sectionId) {
			if (!lastState) {
				return;
			}
			lastSectionId = sectionId;
			void persistState(lastState, true);
		}
	};

	return {
		getHooks() {
			return hooks;
		},

		async destroy() {
			clearPeriodicFlush();
			deps.scheduler.destroy();
			if (lastState) {
				await persistState(lastState, true);
			}
		}
	};
}

export function resolveBookTitle(index: BookCacheIndex, sourcePath: string): string {
	return index.title?.trim() || basenameFromPath(sourcePath);
}

export function resolveNoteTitle(sourcePath: string): string {
	return basenameFromPath(sourcePath).replace(/\.md$/i, '');
}
