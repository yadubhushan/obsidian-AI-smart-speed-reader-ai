import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/services/eventBus';
import { createPluginDataPaths } from '../src/store/pluginDataPaths';
import { ReadingStateStoreImpl } from '../src/store/ReadingStateStore';
import { createNodeDataAdapter } from './nodeDataAdapter';
import type { App } from 'obsidian';
import type { ReadingState } from '../src/types/m2Contracts';

const PLUGIN_ID = 'speed-reader-ai';

function createMockApp(rootDir: string): App {
	return {
		vault: {
			configDir: join(rootDir, '.obsidian'),
			adapter: createNodeDataAdapter(rootDir)
		}
	} as App;
}

async function readSqliteReadingState(
	app: App,
	dbPath: string
): Promise<{ lastGlobalSourcePath: string; sources: Record<string, ReadingState> }> {
	const SQL = await initSqlJs();
	const data = await app.vault.adapter.readBinary(dbPath);
	const db = new SQL.Database(new Uint8Array(data));
	try {
		const result = db.exec('SELECT state_json FROM reading_states');
		const sources: Record<string, ReadingState> = {};
		for (const row of result[0]?.values ?? []) {
			const raw = row[0];
			if (typeof raw === 'string') {
				const state = JSON.parse(raw) as ReadingState;
				sources[state.sourcePath] = state;
			}
		}
		const meta = db.exec('SELECT value FROM metadata WHERE key = ?', [
			'lastGlobalSourcePath'
		]);
		const lastGlobalSourcePath = meta[0]?.values[0]?.[0];
		return {
			lastGlobalSourcePath:
				typeof lastGlobalSourcePath === 'string' ? lastGlobalSourcePath : '',
			sources
		};
	} finally {
		db.close();
	}
}

async function writeSqliteReadingState(
	app: App,
	dbPath: string,
	file: { lastGlobalSourcePath: string; sources: Record<string, ReadingState> }
): Promise<void> {
	const SQL = await initSqlJs();
	const db = new SQL.Database();
	try {
		db.run(`
			CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
			CREATE TABLE reading_states (
				source_path TEXT PRIMARY KEY NOT NULL,
				state_json TEXT NOT NULL,
				last_opened_at TEXT NOT NULL
			);
		`);
		db.run('INSERT INTO metadata (key, value) VALUES (?, ?)', [
			'lastGlobalSourcePath',
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
		const bytes = db.export();
		const copy = new Uint8Array(bytes.byteLength);
		copy.set(bytes);
		await app.vault.adapter.writeBinary(dbPath, copy.buffer);
	} finally {
		db.close();
	}
}

const sampleState = (
	sourcePath: string,
	lastOpenedAt = '2026-05-21T00:00:00.000Z',
	wordIndex = 12
): ReadingState => ({
	sourcePath,
	sourceKind: 'book',
	title: 'Sample',
	folder: 'books',
	sourceChecksum: 'abc123',
	lastOpenedAt,
	pinned: false,
	status: 'in_progress',
	playbackMode: 'rsvp',
	position: { chapterId: 'chapter-01', wordIndex },
	progressPercent: 4
});

describe('ReadingStateStore', () => {
	let rootDir: string;

	beforeEach(async () => {
		rootDir = await mkdtemp(join(tmpdir(), 'speed-reader-reading-state-'));
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	it('loads empty file when missing', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		const file = await store.load();

		expect(file.lastGlobalSourcePath).toBe('');
		expect(file.sources).toEqual({});
	});

	it('upserts and flushes to disk', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		await store.load();
		await store.upsert(sampleState('books/a.epub'));
		await store.flush();

		const parsed = await readSqliteReadingState(app, paths.dbFile);
		expect(parsed.sources['books/a.epub']?.position).toEqual({ chapterId: 'chapter-01', wordIndex: 12 });
	});

	it('updates lastGlobalSourcePath on setLastGlobal', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		await store.load();
		await store.setLastGlobal('notes/foo.md');
		await store.flush();

		expect((await store.load()).lastGlobalSourcePath).toBe('notes/foo.md');
	});

	it('removes state and clears lastGlobalSourcePath when deleting the active source', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		await store.load();
		await store.upsert(sampleState('books/a.epub'));
		await store.setLastGlobal('books/a.epub');
		await store.flush();

		await store.remove('books/a.epub');
		await store.flush();

		const parsed = await readSqliteReadingState(app, paths.dbFile);
		expect(parsed.lastGlobalSourcePath).toBe('');
		expect(parsed.sources['books/a.epub']).toBeUndefined();
	});

	it('emits reading-state-changed on flush', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const onChanged = vi.fn();
		eventBus.on('reading-state-changed', onChanged);
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		await store.load();
		await store.upsert(sampleState('books/a.epub'));
		await store.flush();

		expect(onChanged).toHaveBeenCalledWith({ sourcePath: 'books/a.epub' });
	});

	it('emits reading-state-flushed on flush', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const onFlushed = vi.fn();
		eventBus.on('reading-state-flushed', onFlushed);
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		await store.load();
		await store.upsert(sampleState('books/a.epub'));
		await store.flush();

		expect(onFlushed).toHaveBeenCalled();
	});

	it('notifies onChanged subscribers after flush', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		await store.load();
		const callback = vi.fn();
		store.onChanged(callback);
		await store.upsert(sampleState('books/a.epub'));
		await store.flush();

		expect(callback).toHaveBeenCalled();
	});

	it('reloadFromDisk picks up external file changes when not dirty', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const onChanged = vi.fn();
		eventBus.on('reading-state-changed', onChanged);
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		await store.load();
		await store.upsert(sampleState('books/a.epub'));
		await store.flush();
		onChanged.mockClear();

		const synced = {
			lastGlobalSourcePath: 'books/b.epub',
			sources: {
				'books/b.epub': sampleState('books/b.epub')
			}
		};
		await writeSqliteReadingState(app, paths.dbFile, synced);

		const reloaded = await store.reloadFromDisk();
		expect(reloaded).toBe(true);
		expect(store.get('books/b.epub')?.sourcePath).toBe('books/b.epub');
		expect(store.get('books/a.epub')).toBeUndefined();
		expect(onChanged).toHaveBeenCalledWith({ sourcePath: 'books/b.epub' });
	});

	it('reloadFromDisk merges dirty local state with newer disk entries', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		await store.load();
		await store.upsert(sampleState('books/a.epub', '2026-05-21T00:00:00.000Z', 12));

		const synced = {
			lastGlobalSourcePath: 'books/b.epub',
			sources: {
				'books/b.epub': sampleState('books/b.epub', '2026-05-22T00:00:00.000Z', 99)
			}
		};
		await writeSqliteReadingState(app, paths.dbFile, synced);

		const reloaded = await store.reloadFromDisk();
		expect(reloaded).toBe(true);
		expect(store.isDirty()).toBe(true);
		expect(store.get('books/a.epub')?.position.wordIndex).toBe(12);
		expect(store.get('books/b.epub')?.position.wordIndex).toBe(99);
	});

	it('reloadFromDisk keeps newer local entry over older disk entry', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		await store.load();
		await store.upsert(sampleState('books/a.epub', '2026-05-23T00:00:00.000Z', 42));

		const synced = {
			lastGlobalSourcePath: 'books/a.epub',
			sources: {
				'books/a.epub': sampleState('books/a.epub', '2026-05-21T00:00:00.000Z', 12)
			}
		};
		await writeSqliteReadingState(app, paths.dbFile, synced);

		await store.reloadFromDisk();
		expect(store.get('books/a.epub')?.position.wordIndex).toBe(42);
		expect(store.isDirty()).toBe(true);
	});

	it('ignores legacy JSON when sqlite is missing', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		await app.vault.adapter.write(
			paths.readingStateFile,
			JSON.stringify({
				lastGlobalSourcePath: 'books/a.epub',
				sources: {
					'books/a.epub': sampleState('books/a.epub')
				}
			})
		);

		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		const loaded = await store.load();

		expect(loaded.lastGlobalSourcePath).toBe('');
		expect(loaded.sources).toEqual({});
	});

	it('ignores legacy JSON when sqlite exists but has no reading state', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		await writeSqliteReadingState(app, paths.dbFile, {
			lastGlobalSourcePath: '',
			sources: {}
		});
		await app.vault.adapter.write(
			paths.readingStateFile,
			JSON.stringify({
				lastGlobalSourcePath: 'books/a.epub',
				sources: {
					'books/a.epub': sampleState('books/a.epub')
				}
			})
		);

		const store = ReadingStateStoreImpl.create(
			app,
			eventBus,
			paths.dbFile,
		);
		const loaded = await store.load();

		expect(loaded.lastGlobalSourcePath).toBe('');
		expect(loaded.sources).toEqual({});
	});
});
