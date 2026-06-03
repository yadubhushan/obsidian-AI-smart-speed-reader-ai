import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveScheduler } from '../src/reader/saveScheduler';
import type { ReadingStateStore } from '../src/types/m2Contracts';

function createMockStore(): ReadingStateStore {
	return {
		load: vi.fn(),
		reloadFromDisk: vi.fn(),
		isDirty: vi.fn(() => false),
		get: vi.fn(),
		upsert: vi.fn(),
		remove: vi.fn(),
		setLastGlobal: vi.fn(),
		flush: vi.fn().mockResolvedValue(undefined),
		onChanged: vi.fn(() => () => undefined)
	};
}

describe('saveScheduler', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('debounces rapid scheduleSave calls', async () => {
		const store = createMockStore();
		const scheduler = createSaveScheduler(store, 5000);

		scheduler.scheduleSave();
		scheduler.scheduleSave();
		scheduler.scheduleSave();

		expect(store.flush).not.toHaveBeenCalled();
		vi.advanceTimersByTime(4999);
		expect(store.flush).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		await Promise.resolve();
		expect(store.flush).toHaveBeenCalledTimes(1);

		scheduler.destroy();
	});

	it('flushNow clears pending debounce and flushes immediately', async () => {
		const store = createMockStore();
		const scheduler = createSaveScheduler(store, 5000);

		scheduler.scheduleSave();
		await scheduler.flushNow();

		expect(store.flush).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(5000);
		await Promise.resolve();
		expect(store.flush).toHaveBeenCalledTimes(1);

		scheduler.destroy();
	});

	it('destroy clears pending timer without flushing', () => {
		const store = createMockStore();
		const scheduler = createSaveScheduler(store, 5000);

		scheduler.scheduleSave();
		scheduler.destroy();
		vi.advanceTimersByTime(5000);

		expect(store.flush).not.toHaveBeenCalled();
	});
});
