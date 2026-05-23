import type {
	ReadingState,
	ReadingStateFile,
	ReadingStateStore
} from '../types/m2Contracts';

const EMPTY_FILE: ReadingStateFile = {
	lastGlobalSourcePath: '',
	sources: {}
};

/** Feature 1 stub — no disk persistence until Feature 2. */
export class ReadingStateStoreStub implements ReadingStateStore {
	private file: ReadingStateFile = { ...EMPTY_FILE, sources: {} };
	private changedCallbacks = new Set<() => void>();

	async load(): Promise<ReadingStateFile> {
		return this.file;
	}

	async reloadFromDisk(): Promise<boolean> {
		return true;
	}

	isDirty(): boolean {
		return false;
	}

	get(_sourcePath: string): ReadingState | undefined {
		return undefined;
	}

	async upsert(_state: ReadingState): Promise<void> {
		// no-op
	}

	async setLastGlobal(_sourcePath: string): Promise<void> {
		// no-op
	}

	async flush(): Promise<void> {
		// no-op
	}

	onChanged(callback: () => void): () => void {
		this.changedCallbacks.add(callback);
		return () => {
			this.changedCallbacks.delete(callback);
		};
	}
}
