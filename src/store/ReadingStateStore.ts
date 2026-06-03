import type { App } from 'obsidian';
import initSqlJs from 'sql.js/dist/sql-asm.js';
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
const META_LAST_GLOBAL_SOURCE_PATH = 'lastGlobalSourcePath';

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
type SqliteDatabase = InstanceType<SqlJsStatic['Database']>;

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
	sqlJsPromise ??= initSqlJs();
	return sqlJsPromise;
}

export class ReadingStateStoreImpl implements ReadingStateStore {
	private file: ReadingStateFile = { ...EMPTY_FILE, sources: {} };
	private dirty = false;
	private loaded = false;
	private changedCallbacks = new Set<() => void>();
	private pendingChangedPaths = new Set<string>();

	constructor(
		private readonly app: App,
		private readonly eventBus: EventBus,
		private readonly dbPath: string,
		private readonly pluginId = 'speed-reader-ai'
	) {}

	static create(
		app: App,
		eventBus: EventBus,
		dbPath: string,
		pluginId?: string
	): ReadingStateStoreImpl {
		return new ReadingStateStoreImpl(app, eventBus, dbPath, pluginId);
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
		try {
			const { db } = await this.openDatabase();
			try {
				return readFileFromDatabase(db);
			} finally {
				db.close();
			}
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

	async remove(sourcePath: string): Promise<void> {
		await this.load();
		if (!this.file.sources[sourcePath] && this.file.lastGlobalSourcePath !== sourcePath) {
			return;
		}
		delete this.file.sources[sourcePath];
		if (this.file.lastGlobalSourcePath === sourcePath) {
			this.file.lastGlobalSourcePath = '';
		}
		this.markDirty(sourcePath);
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
		const { db } = await this.openDatabase();
		try {
			writeFileToDatabase(db, this.file);
			await ensureParentFolderForFile(adapter, this.dbPath);
			await adapter.writeBinary(this.dbPath, databaseToArrayBuffer(db));
		} finally {
			db.close();
		}

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

	private async openDatabase(): Promise<{ db: SqliteDatabase; existed: boolean }> {
		const SQL = await getSqlJs();
		const adapter = this.app.vault.adapter;
		const existed = await adapter.exists(this.dbPath);
		if (!existed) {
			const db = new SQL.Database();
			ensureSchema(db);
			return { db, existed };
		}

		const data = await adapter.readBinary(this.dbPath);
		const db = new SQL.Database(new Uint8Array(data));
		ensureSchema(db);
		return { db, existed };
	}
}

function ensureSchema(db: SqliteDatabase): void {
	db.run(`
		CREATE TABLE IF NOT EXISTS metadata (
			key TEXT PRIMARY KEY NOT NULL,
			value TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS reading_states (
			source_path TEXT PRIMARY KEY NOT NULL,
			state_json TEXT NOT NULL,
			last_opened_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_reading_states_last_opened_at
			ON reading_states(last_opened_at);
	`);
}

function readFileFromDatabase(db: SqliteDatabase): ReadingStateFile {
	const file: ReadingStateFile = { ...EMPTY_FILE, sources: {} };
	const metaRows = db.exec('SELECT value FROM metadata WHERE key = ? LIMIT 1', [
		META_LAST_GLOBAL_SOURCE_PATH
	]);
	const lastGlobal = metaRows[0]?.values[0]?.[0];
	if (typeof lastGlobal === 'string') {
		file.lastGlobalSourcePath = lastGlobal;
	}

	const rows = db.exec('SELECT state_json FROM reading_states');
	for (const row of rows[0]?.values ?? []) {
		const rawState = row[0];
		if (typeof rawState !== 'string') {
			continue;
		}
		try {
			const state = JSON.parse(rawState) as ReadingState;
			if (typeof state.sourcePath === 'string' && state.sourcePath.length > 0) {
				file.sources[state.sourcePath] = state;
			}
		} catch {
			/* ignore corrupt row */
		}
	}

	return normalizeFile(file);
}

function writeFileToDatabase(db: SqliteDatabase, file: ReadingStateFile): void {
	db.run('BEGIN TRANSACTION');
	try {
		db.run('DELETE FROM metadata');
		db.run('DELETE FROM reading_states');
		db.run('INSERT INTO metadata (key, value) VALUES (?, ?)', [
			META_LAST_GLOBAL_SOURCE_PATH,
			file.lastGlobalSourcePath
		]);

		const stmt = db.prepare(`
			INSERT INTO reading_states (source_path, state_json, last_opened_at)
			VALUES (?, ?, ?)
		`);
		try {
			for (const state of Object.values(file.sources)) {
				stmt.run([state.sourcePath, JSON.stringify(state), state.lastOpenedAt]);
			}
		} finally {
			stmt.free();
		}
		db.run('COMMIT');
	} catch (err) {
		db.run('ROLLBACK');
		throw err;
	}
}

function databaseToArrayBuffer(db: SqliteDatabase): ArrayBuffer {
	const bytes = db.export();
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
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
