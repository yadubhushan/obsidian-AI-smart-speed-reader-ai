import { Plugin } from 'obsidian';
import type { ReadingStateStore } from '../types/m2Contracts';

export interface ReadingStateSyncDeps {
	getStore(): ReadingStateStore | null;
	/** Re-run plugin data migration before reloading (sync may deliver files in old locations). */
	migrate(): Promise<unknown>;
}

/**
 * Keeps on-disk reading state and the in-memory store consistent across
 * app background/foreground transitions and Obsidian Sync updates.
 */
export class ReadingStateSyncCoordinator {
	constructor(private readonly deps: ReadingStateSyncDeps) {}

	register(plugin: Plugin): void {
		plugin.registerDomEvent(document, 'visibilitychange', () => {
			if (document.visibilityState === 'visible') {
				void this.reloadFromSync();
			} else if (document.visibilityState === 'hidden') {
				void this.flushBeforeBackground();
			}
		});
	}

	async flushBeforeBackground(): Promise<void> {
		const store = this.deps.getStore();
		if (!store?.isDirty()) {
			return;
		}
		await store.flush();
	}

	/** Reload reading progress after sync or when the app returns to foreground. */
	async reloadFromSync(): Promise<void> {
		const store = this.deps.getStore();
		if (!store) {
			return;
		}
		await this.deps.migrate();
		await store.reloadFromDisk();
	}

	/** Best-effort flush of unsaved progress when the plugin unloads. */
	flushOnUnload(): void {
		const store = this.deps.getStore();
		if (store?.isDirty()) {
			void store.flush();
		}
	}
}
