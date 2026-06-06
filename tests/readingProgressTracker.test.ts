import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CONTINUOUS_READING_MILESTONE_MS,
	PAUSED_READING_SESSION_INVALIDATION_MS,
	PERIODIC_FLUSH_MS,
	READING_HABIT_THRESHOLD_MS,
	createReadingProgressTracker
} from '../src/reader/readingProgressTracker';
import type { RSVPEngine } from '../src/engine/rsvpEngine';
import type { SaveScheduler } from '../src/reader/saveScheduler';
import type { ReaderState } from '../src/types';
import type { ReadingStateStore } from '../src/types/m2Contracts';
import type { ProcessedDocument } from '../src/types/processedDocument';

const processed: ProcessedDocument = {
	kind: 'sections',
	processorId: 'sections',
	meta: {
		sourcePath: 'notes/foo.md',
		sourceChecksum: 'checksum-a',
		processedAt: '2026-06-03T00:00:00.000Z',
		model: 'deterministic',
		prepareStrategy: 'single'
	},
	sections: [
		{
			sectionId: 'intro',
			title: 'Intro',
			stream: [
				{ kind: 'word', text: 'one' },
				{ kind: 'word', text: 'two' },
				{ kind: 'word', text: 'three' }
			]
		}
	]
};

function createMockEngine(): RSVPEngine {
	return {
		getSectionList: () => [{ id: 'intro', title: 'Intro' }],
		getLoadedProcessedDocument: () => processed,
		getPlaybackMode: () => 'rsvp'
	} as RSVPEngine;
}

function createMockStore(): ReadingStateStore {
	return {
		load: vi.fn(),
		reloadFromDisk: vi.fn(),
		isDirty: vi.fn(() => false),
		get: vi.fn(),
		upsert: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn(),
		setLastGlobal: vi.fn(),
		flush: vi.fn().mockResolvedValue(undefined),
		onChanged: vi.fn(() => () => undefined)
	};
}

function createMockScheduler(): SaveScheduler {
	return {
		scheduleSave: vi.fn(),
		flushNow: vi.fn().mockResolvedValue(undefined),
		destroy: vi.fn()
	};
}

describe('readingProgressTracker', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('persists and flushes the active reader state every 5 seconds', async () => {
		const store = createMockStore();
		const scheduler = createMockScheduler();
		const tracker = createReadingProgressTracker({
			sourcePath: 'notes/foo.md',
			sourceKind: 'note',
			title: 'Foo',
			sourceChecksum: 'checksum-a',
			engine: createMockEngine(),
			readingStateStore: store,
			scheduler
		});
		const hooks = tracker.getHooks();

		hooks.onEngineStateChange?.(
			{
				isPlaying: true,
				currentIndex: 1,
				currentTokenIndex: 1,
				currentSectionIndex: 0,
				totalWords: 3,
				totalTokens: 3
			} as ReaderState,
			false
		);
		await Promise.resolve();

		expect(scheduler.scheduleSave).toHaveBeenCalledTimes(1);
		expect(scheduler.flushNow).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(PERIODIC_FLUSH_MS);

		expect(store.upsert).toHaveBeenCalledTimes(2);
		expect(scheduler.flushNow).toHaveBeenCalledTimes(1);

		await tracker.destroy();
	});

	it('tracks the longest uninterrupted reading stretch separately from total played time', async () => {
		const store = createMockStore();
		const scheduler = createMockScheduler();
		const tracker = createReadingProgressTracker({
			sourcePath: 'notes/foo.md',
			sourceKind: 'note',
			title: 'Foo',
			sourceChecksum: 'checksum-a',
			engine: createMockEngine(),
			readingStateStore: store,
			scheduler
		});
		const hooks = tracker.getHooks();
		const pausedState = {
			isPlaying: false,
			currentIndex: 1,
			currentTokenIndex: 1,
			currentSectionIndex: 0,
			totalWords: 3,
			totalTokens: 3
		} as ReaderState;
		const playingState = {
			...pausedState,
			isPlaying: true
		} as ReaderState;

		hooks.onEngineStateChange?.(playingState, false);
		await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
		hooks.onEngineStateChange?.(pausedState, true);

		hooks.onEngineStateChange?.(playingState, false);
		await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
		hooks.onEngineStateChange?.(pausedState, true);

		const result = await tracker.destroy();

		expect(result.playedMs).toBe(8 * 60 * 1000);
		expect(result.longestContinuousPlayedMs).toBe(6 * 60 * 1000);
	});

	it('fires the continuous reading milestone once per uninterrupted stretch', async () => {
		const store = createMockStore();
		const scheduler = createMockScheduler();
		const onContinuousReadingMilestone = vi.fn();
		const tracker = createReadingProgressTracker({
			sourcePath: 'notes/foo.md',
			sourceKind: 'note',
			title: 'Foo',
			sourceChecksum: 'checksum-a',
			engine: createMockEngine(),
			readingStateStore: store,
			scheduler,
			onContinuousReadingMilestone
		});
		const hooks = tracker.getHooks();
		const pausedState = {
			isPlaying: false,
			currentIndex: 1,
			currentTokenIndex: 1,
			currentSectionIndex: 0,
			totalWords: 3,
			totalTokens: 3
		} as ReaderState;
		const playingState = {
			...pausedState,
			isPlaying: true
		} as ReaderState;

		hooks.onEngineStateChange?.(playingState, false);
		await vi.advanceTimersByTimeAsync(CONTINUOUS_READING_MILESTONE_MS - 1);
		expect(onContinuousReadingMilestone).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(onContinuousReadingMilestone).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(CONTINUOUS_READING_MILESTONE_MS);
		expect(onContinuousReadingMilestone).toHaveBeenCalledTimes(1);

		hooks.onEngineStateChange?.(pausedState, true);
		hooks.onEngineStateChange?.(playingState, false);
		await vi.advanceTimersByTimeAsync(CONTINUOUS_READING_MILESTONE_MS);
		expect(onContinuousReadingMilestone).toHaveBeenCalledTimes(2);
	});

	it('logs the reading habit when valid played time reaches two minutes', async () => {
		const store = createMockStore();
		const scheduler = createMockScheduler();
		const onReadingHabitThreshold = vi.fn();
		const tracker = createReadingProgressTracker({
			sourcePath: 'notes/foo.md',
			sourceKind: 'note',
			title: 'Foo',
			sourceChecksum: 'checksum-a',
			engine: createMockEngine(),
			readingStateStore: store,
			scheduler,
			onReadingHabitThreshold
		});
		const hooks = tracker.getHooks();
		const pausedState = {
			isPlaying: false,
			currentIndex: 1,
			currentTokenIndex: 1,
			currentSectionIndex: 0,
			totalWords: 3,
			totalTokens: 3
		} as ReaderState;
		const playingState = {
			...pausedState,
			isPlaying: true
		} as ReaderState;

		hooks.onEngineStateChange?.(playingState, false);
		await vi.advanceTimersByTimeAsync(READING_HABIT_THRESHOLD_MS - 1);
		expect(onReadingHabitThreshold).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(onReadingHabitThreshold).toHaveBeenCalledTimes(1);
		expect(onReadingHabitThreshold).toHaveBeenCalledWith(READING_HABIT_THRESHOLD_MS);

		hooks.onEngineStateChange?.(pausedState, true);
		hooks.onEngineStateChange?.(playingState, false);
		await vi.advanceTimersByTimeAsync(READING_HABIT_THRESHOLD_MS);
		expect(onReadingHabitThreshold).toHaveBeenCalledTimes(1);

		await tracker.destroy();
	});

	it('invalidates unlogged played time after five minutes paused', async () => {
		const store = createMockStore();
		const scheduler = createMockScheduler();
		const onReadingHabitThreshold = vi.fn();
		const tracker = createReadingProgressTracker({
			sourcePath: 'notes/foo.md',
			sourceKind: 'note',
			title: 'Foo',
			sourceChecksum: 'checksum-a',
			engine: createMockEngine(),
			readingStateStore: store,
			scheduler,
			onReadingHabitThreshold
		});
		const hooks = tracker.getHooks();
		const pausedState = {
			isPlaying: false,
			currentIndex: 1,
			currentTokenIndex: 1,
			currentSectionIndex: 0,
			totalWords: 3,
			totalTokens: 3
		} as ReaderState;
		const playingState = {
			...pausedState,
			isPlaying: true
		} as ReaderState;

		hooks.onEngineStateChange?.(playingState, false);
		await vi.advanceTimersByTimeAsync(60 * 1000);
		hooks.onEngineStateChange?.(pausedState, true);
		await vi.advanceTimersByTimeAsync(PAUSED_READING_SESSION_INVALIDATION_MS);

		hooks.onEngineStateChange?.(playingState, false);
		await vi.advanceTimersByTimeAsync(60 * 1000);
		hooks.onEngineStateChange?.(pausedState, true);
		expect(onReadingHabitThreshold).not.toHaveBeenCalled();

		hooks.onEngineStateChange?.(playingState, false);
		await vi.advanceTimersByTimeAsync(60 * 1000);
		expect(onReadingHabitThreshold).toHaveBeenCalledTimes(1);

		await tracker.destroy();
	});
});
