import { describe, expect, it } from 'vitest';
import { ReadingStateSyncCoordinator } from '../src/boot/syncCoordinator';
import type { ReadingStateStore } from '../src/types/m2Contracts';

interface StoreStub {
	store: ReadingStateStore;
	calls: string[];
	setDirty(dirty: boolean): void;
}

function createStoreStub(): StoreStub {
	const calls: string[] = [];
	let dirty = false;
	const store = {
		isDirty: () => dirty,
		flush: async () => {
			calls.push('flush');
			dirty = false;
		},
		reloadFromDisk: async () => {
			calls.push('reload');
			return true;
		}
	} as unknown as ReadingStateStore;
	return {
		store,
		calls,
		setDirty(next: boolean) {
			dirty = next;
		}
	};
}

function createCoordinator(stub: StoreStub | null, migrateCalls: string[]) {
	return new ReadingStateSyncCoordinator({
		getStore: () => stub?.store ?? null,
		migrate: async () => {
			migrateCalls.push('migrate');
		}
	});
}

describe('ReadingStateSyncCoordinator', () => {
	it('flushes before background only when dirty', async () => {
		const stub = createStoreStub();
		const coordinator = createCoordinator(stub, []);

		await coordinator.flushBeforeBackground();
		expect(stub.calls).toEqual([]);

		stub.setDirty(true);
		await coordinator.flushBeforeBackground();
		expect(stub.calls).toEqual(['flush']);
	});

	it('migrates plugin data before reloading from sync', async () => {
		const stub = createStoreStub();
		const migrateCalls: string[] = [];
		const coordinator = createCoordinator(stub, migrateCalls);

		await coordinator.reloadFromSync();

		expect(migrateCalls).toEqual(['migrate']);
		expect(stub.calls).toEqual(['reload']);
	});

	it('no-ops when the store is not available yet', async () => {
		const migrateCalls: string[] = [];
		const coordinator = createCoordinator(null, migrateCalls);

		await coordinator.flushBeforeBackground();
		await coordinator.reloadFromSync();
		coordinator.flushOnUnload();

		expect(migrateCalls).toEqual([]);
	});

	it('flushes dirty state on unload', () => {
		const stub = createStoreStub();
		const coordinator = createCoordinator(stub, []);

		coordinator.flushOnUnload();
		expect(stub.calls).toEqual([]);

		stub.setDirty(true);
		coordinator.flushOnUnload();
		expect(stub.calls).toEqual(['flush']);
	});
});
