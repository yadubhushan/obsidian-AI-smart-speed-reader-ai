import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PERIODIC_FLUSH_MS,
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
});
