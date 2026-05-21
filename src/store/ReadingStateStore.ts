import type { App } from 'obsidian';
import type { EventBus } from '../services/eventBus';
import type {
	ReadingState,
	ReadingStateFile,
	ReadingStateStore
} from '../types/m2Contracts';
import { readingStateDataDir, readingStateFilePath } from './readingStatePaths';

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

	static create(app: App, eventBus: EventBus): ReadingStateStoreImpl {
		return new ReadingStateStoreImpl(
			app,
			eventBus,
			readingStateFilePath()
		);
	}

	async load(): Promise<ReadingStateFile> {
		if (this.loaded) {
			return this.file;
		}

		const adapter = this.app.vault.adapter;
		try {
			const raw = await adapter.read(this.filePath);
			const parsed = JSON.parse(raw) as Partial<ReadingStateFile>;
			this.file = normalizeFile(parsed);
		} catch {
			this.file = { ...EMPTY_FILE, sources: {} };
		}

		this.loaded = true;
		this.dirty = false;
		return this.file;
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
		const dataDir = readingStateDataDir();
		await adapter.mkdir(dataDir).catch(() => undefined);
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
