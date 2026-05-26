import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
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
		const store = ReadingStateStoreImpl.create(app, eventBus, paths.readingStateFile);
		const file = await store.load();

		expect(file.lastGlobalSourcePath).toBe('');
		expect(file.sources).toEqual({});
	});

	it('upserts and flushes to disk', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(app, eventBus, paths.readingStateFile);
		await store.load();
		await store.upsert(sampleState('books/a.epub'));
		await store.flush();

		const raw = await app.vault.adapter.read(paths.readingStateFile);
		const parsed = JSON.parse(raw) as { sources: Record<string, ReadingState> };
		expect(parsed.sources['books/a.epub']?.position).toEqual({ chapterId: 'chapter-01', wordIndex: 12 });
	});

	it('updates lastGlobalSourcePath on setLastGlobal', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(app, eventBus, paths.readingStateFile);
		await store.load();
		await store.setLastGlobal('notes/foo.md');
		await store.flush();

		expect((await store.load()).lastGlobalSourcePath).toBe('notes/foo.md');
	});

	it('emits reading-state-changed on flush', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const onChanged = vi.fn();
		eventBus.on('reading-state-changed', onChanged);
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(app, eventBus, paths.readingStateFile);
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
		const store = ReadingStateStoreImpl.create(app, eventBus, paths.readingStateFile);
		await store.load();
		await store.upsert(sampleState('books/a.epub'));
		await store.flush();

		expect(onFlushed).toHaveBeenCalled();
	});

	it('notifies onChanged subscribers after flush', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const paths = createPluginDataPaths(app.vault.configDir, PLUGIN_ID);
		const store = ReadingStateStoreImpl.create(app, eventBus, paths.readingStateFile);
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
		const store = ReadingStateStoreImpl.create(app, eventBus, paths.readingStateFile);
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
		await app.vault.adapter.write(paths.readingStateFile, JSON.stringify(synced));

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
		const store = ReadingStateStoreImpl.create(app, eventBus, paths.readingStateFile);
		await store.load();
		await store.upsert(sampleState('books/a.epub', '2026-05-21T00:00:00.000Z', 12));

		const synced = {
			lastGlobalSourcePath: 'books/b.epub',
			sources: {
				'books/b.epub': sampleState('books/b.epub', '2026-05-22T00:00:00.000Z', 99)
			}
		};
		await app.vault.adapter.write(paths.readingStateFile, JSON.stringify(synced));

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
		const store = ReadingStateStoreImpl.create(app, eventBus, paths.readingStateFile);
		await store.load();
		await store.upsert(sampleState('books/a.epub', '2026-05-23T00:00:00.000Z', 42));

		const synced = {
			lastGlobalSourcePath: 'books/a.epub',
			sources: {
				'books/a.epub': sampleState('books/a.epub', '2026-05-21T00:00:00.000Z', 12)
			}
		};
		await app.vault.adapter.write(paths.readingStateFile, JSON.stringify(synced));

		await store.reloadFromDisk();
		expect(store.get('books/a.epub')?.position.wordIndex).toBe(42);
		expect(store.isDirty()).toBe(true);
	});
});
