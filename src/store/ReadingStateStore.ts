import type { App } from 'obsidian';
import type { EventBus } from '../services/eventBus';
import type {
	ReadingState,
	ReadingStateFile,
	ReadingStateStore
} from '../types/m2Contracts';
import { ensureParentFolderForFile } from '../utils/vaultAdapterDirs';
import {
	mergeReadingStateFiles,
	readingStateFilesEqual
} from './readingStateMerge';

const EMPTY_FILE: ReadingStateFile = {
	lastGlobalSourcePath: '',
	sources: {}
};

export class ReadingStateStoreImpl implements ReadingStateStore {
	private file: ReadingStateFile = { ...EMPTY_FILE, sources: {} };
	private dirty = false;
	private loaded = false;
	private changedCallbacks = new Set<() => void>();
	private pendingChangedPaths = new Set<string>();

	constructor(
		private readonly app: App,
		private readonly eventBus: EventBus,
		private readonly filePath: string
	) {}

	static create(app: App, eventBus: EventBus, readingStateFile: string): ReadingStateStoreImpl {
		return new ReadingStateStoreImpl(app, eventBus, readingStateFile);
	}

	async load(): Promise<ReadingStateFile> {
		if (this.loaded) {
			return this.file;
		}

		this.file = await this.readDiskFile();
		this.loaded = true;
		this.dirty = false;
		return this.file;
	}

	isDirty(): boolean {
		return this.dirty;
	}

	/** Re-read disk and merge with local edits (newer `lastOpenedAt` wins per source). */
	async reloadFromDisk(): Promise<boolean> {
		const diskFile = await this.readDiskFile();

		if (!this.loaded) {
			this.file = diskFile;
			this.loaded = true;
			this.dirty = false;
			this.notifyReload();
			return true;
		}

		if (!this.dirty) {
			const changed = !readingStateFilesEqual(this.file, diskFile);
			this.file = diskFile;
			if (changed) {
				this.notifyReload();
			}
			return true;
		}

		const { merged, localHadNewer } = mergeReadingStateFiles(this.file, diskFile);
		const changed = !readingStateFilesEqual(this.file, merged);
		this.file = merged;
		this.dirty = localHadNewer;
		if (changed) {
			this.notifyReload();
		}
		return true;
	}

	private async readDiskFile(): Promise<ReadingStateFile> {
		const adapter = this.app.vault.adapter;
		try {
			const raw = await adapter.read(this.filePath);
			const parsed = JSON.parse(raw) as Partial<ReadingStateFile>;
			return normalizeFile(parsed);
		} catch {
			return { ...EMPTY_FILE, sources: {} };
		}
	}

	private notifyReload(): void {
		for (const callback of this.changedCallbacks) {
			callback();
		}

		for (const sourcePath of Object.keys(this.file.sources)) {
			this.eventBus.emit('reading-state-changed', { sourcePath });
		}
	}

	get(sourcePath: string): ReadingState | undefined {
		return this.file.sources[sourcePath];
	}

	async upsert(state: ReadingState): Promise<void> {
		this.file.sources[state.sourcePath] = state;
		this.markDirty(state.sourcePath);
	}

	async setLastGlobal(sourcePath: string): Promise<void> {
		this.file.lastGlobalSourcePath = sourcePath;
		this.markDirty(sourcePath);
	}

	async flush(): Promise<void> {
		if (!this.dirty) {
			return;
		}

		const adapter = this.app.vault.adapter;
		await ensureParentFolderForFile(adapter, this.filePath);
		await adapter.write(this.filePath, JSON.stringify(this.file, null, 2));

		const changedPaths = [...this.pendingChangedPaths];
		this.pendingChangedPaths.clear();
		this.dirty = false;

		for (const callback of this.changedCallbacks) {
			callback();
		}

		for (const sourcePath of changedPaths) {
			this.eventBus.emit('reading-state-changed', { sourcePath });
		}

		this.eventBus.emit('reading-state-flushed', {});
	}

	onChanged(callback: () => void): () => void {
		this.changedCallbacks.add(callback);
		return () => {
			this.changedCallbacks.delete(callback);
		};
	}

	private markDirty(sourcePath: string): void {
		this.dirty = true;
		this.pendingChangedPaths.add(sourcePath);
	}
}

function normalizeFile(raw: Partial<ReadingStateFile>): ReadingStateFile {
	return {
		lastGlobalSourcePath:
			typeof raw.lastGlobalSourcePath === 'string' ? raw.lastGlobalSourcePath : '',
		sources:
			raw.sources && typeof raw.sources === 'object' && !Array.isArray(raw.sources)
				? { ...raw.sources }
				: {}
	};
}
