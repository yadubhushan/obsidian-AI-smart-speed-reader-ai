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

export const PERIODIC_FLUSH_MS = 5_000;
export const READING_HABIT_THRESHOLD_MS = 2 * 60 * 1000;
export const PAUSED_READING_SESSION_INVALIDATION_MS = 5 * 60 * 1000;
export const CONTINUOUS_READING_MILESTONE_MS = PAUSED_READING_SESSION_INVALIDATION_MS;

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
	onContinuousReadingMilestone?: (elapsedMs: number) => void;
	onReadingHabitThreshold?: (playedMs: number) => void;
}

export interface ReadingProgressTracker {
	destroy(): Promise<{ playedMs: number; longestContinuousPlayedMs: number }>;
	getHooks(): ReaderSessionHooks;
}

export function createReadingProgressTracker(
	deps: ReadingProgressTrackerDeps
): ReadingProgressTracker {
	let lastIsPlaying: boolean | null = null;
	let lastSectionId: string | null = null;
	let lastState: ReaderState | null = null;
	let periodicFlushTimer: ReturnType<typeof setInterval> | null = null;
	let continuousMilestoneTimer: ReturnType<typeof setTimeout> | null = null;
	let readingHabitThresholdTimer: ReturnType<typeof setTimeout> | null = null;
	let pausedInvalidationTimer: ReturnType<typeof setTimeout> | null = null;
	let playedMs = 0;
	let activeSessionPlayedMs = 0;
	let longestContinuousPlayedMs = 0;
	let playStartedAt: number | null = null;
	let continuousMilestoneShown = false;
	let readingHabitThresholdLogged = false;

	const maybeEmitReadingHabitThreshold = () => {
		if (readingHabitThresholdLogged || activeSessionPlayedMs < READING_HABIT_THRESHOLD_MS) {
			return;
		}
		readingHabitThresholdLogged = true;
		deps.onReadingHabitThreshold?.(activeSessionPlayedMs);
	};

	const finalizeCurrentPlayStretch = (endedAt: number) => {
		if (playStartedAt === null) {
			return;
		}
		const stretchMs = Math.max(0, endedAt - playStartedAt);
		playedMs += stretchMs;
		activeSessionPlayedMs += stretchMs;
		longestContinuousPlayedMs = Math.max(longestContinuousPlayedMs, stretchMs);
		playStartedAt = null;
		maybeEmitReadingHabitThreshold();
	};

	const clearPeriodicFlush = () => {
		if (periodicFlushTimer !== null) {
			clearInterval(periodicFlushTimer);
			periodicFlushTimer = null;
		}
	};

	const clearContinuousMilestoneTimer = () => {
		if (continuousMilestoneTimer !== null) {
			clearTimeout(continuousMilestoneTimer);
			continuousMilestoneTimer = null;
		}
	};

	const clearReadingHabitThresholdTimer = () => {
		if (readingHabitThresholdTimer !== null) {
			clearTimeout(readingHabitThresholdTimer);
			readingHabitThresholdTimer = null;
		}
	};

	const clearPausedInvalidationTimer = () => {
		if (pausedInvalidationTimer !== null) {
			clearTimeout(pausedInvalidationTimer);
			pausedInvalidationTimer = null;
		}
	};

	const schedulePausedInvalidation = () => {
		clearPausedInvalidationTimer();
		pausedInvalidationTimer = setTimeout(() => {
			activeSessionPlayedMs = 0;
			pausedInvalidationTimer = null;
		}, PAUSED_READING_SESSION_INVALIDATION_MS);
	};

	const resetContinuousStretchMilestone = () => {
		clearContinuousMilestoneTimer();
		continuousMilestoneShown = false;
	};

	const emitContinuousMilestone = () => {
		if (continuousMilestoneShown || playStartedAt === null) {
			return;
		}
		continuousMilestoneShown = true;
		clearContinuousMilestoneTimer();
		deps.onContinuousReadingMilestone?.(Date.now() - playStartedAt);
	};

	const scheduleContinuousMilestone = () => {
		if (playStartedAt === null || continuousMilestoneShown) {
			return;
		}
		clearContinuousMilestoneTimer();
		continuousMilestoneTimer = setTimeout(() => {
			emitContinuousMilestone();
		}, CONTINUOUS_READING_MILESTONE_MS);
	};

	const scheduleReadingHabitThreshold = () => {
		clearReadingHabitThresholdTimer();
		if (playStartedAt === null || readingHabitThresholdLogged) {
			return;
		}
		const remainingMs = READING_HABIT_THRESHOLD_MS - activeSessionPlayedMs;
		if (remainingMs <= 0) {
			maybeEmitReadingHabitThreshold();
			return;
		}
		readingHabitThresholdTimer = setTimeout(() => {
			readingHabitThresholdTimer = null;
			if (playStartedAt === null || readingHabitThresholdLogged) {
				return;
			}
			finalizeCurrentPlayStretch(Date.now());
			playStartedAt = Date.now();
		}, remainingMs);
	};

	const startPeriodicFlush = () => {
		if (periodicFlushTimer !== null) {
			return;
		}
		periodicFlushTimer = setInterval(() => {
			if (lastState?.isPlaying) {
				void persistState(lastState, true);
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

			if (state.isPlaying && playStartedAt === null) {
				clearPausedInvalidationTimer();
				playStartedAt = Date.now();
				resetContinuousStretchMilestone();
				scheduleContinuousMilestone();
				scheduleReadingHabitThreshold();
			} else if (!state.isPlaying && playStartedAt !== null) {
				finalizeCurrentPlayStretch(Date.now());
				clearReadingHabitThresholdTimer();
				resetContinuousStretchMilestone();
				schedulePausedInvalidation();
			}

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
			if (playStartedAt !== null) {
				finalizeCurrentPlayStretch(Date.now());
			}
			clearPeriodicFlush();
			clearContinuousMilestoneTimer();
			clearReadingHabitThresholdTimer();
			clearPausedInvalidationTimer();
			deps.scheduler.destroy();
			if (lastState) {
				await persistState(lastState, true);
			}
			return { playedMs, longestContinuousPlayedMs };
		}
	};
}

export function resolveBookTitle(index: BookCacheIndex, sourcePath: string): string {
	return index.title?.trim() || basenameFromPath(sourcePath);
}

export function resolveNoteTitle(sourcePath: string): string {
	return basenameFromPath(sourcePath).replace(/\.md$/i, '');
}
