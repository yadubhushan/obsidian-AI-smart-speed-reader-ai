import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/services/eventBus';
import { ReadingStateStoreImpl } from '../src/store/ReadingStateStore';
import { readingStateFilePath } from '../src/store/readingStatePaths';
import { createNodeDataAdapter } from './nodeDataAdapter';
import type { App } from 'obsidian';
import type { ReadingState } from '../src/types/m2Contracts';

function createMockApp(rootDir: string): App {
	return {
		vault: {
			configDir: join(rootDir, '.obsidian'),
			adapter: createNodeDataAdapter(rootDir)
		}
	} as App;
}

const sampleState = (sourcePath: string): ReadingState => ({
	sourcePath,
	sourceKind: 'book',
	title: 'Sample',
	folder: 'books',
	sourceChecksum: 'abc123',
	lastOpenedAt: '2026-05-21T00:00:00.000Z',
	pinned: false,
	status: 'in_progress',
	playbackMode: 'rsvp',
	position: { chapterId: 'chapter-01', wordIndex: 12 },
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
		const store = ReadingStateStoreImpl.create(app, eventBus);
		const file = await store.load();

		expect(file.lastGlobalSourcePath).toBe('');
		expect(file.sources).toEqual({});
	});

	it('upserts and flushes to disk', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const store = ReadingStateStoreImpl.create(app, eventBus);
		await store.load();
		await store.upsert(sampleState('books/a.epub'));
		await store.flush();

		const path = readingStateFilePath();
		const raw = await app.vault.adapter.read(path);
		const parsed = JSON.parse(raw) as { sources: Record<string, ReadingState> };
		expect(parsed.sources['books/a.epub']?.position).toEqual({ chapterId: 'chapter-01', wordIndex: 12 });
	});

	it('updates lastGlobalSourcePath on setLastGlobal', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const store = ReadingStateStoreImpl.create(app, eventBus);
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
		const store = ReadingStateStoreImpl.create(app, eventBus);
		await store.load();
		await store.upsert(sampleState('books/a.epub'));
		await store.flush();

		expect(onChanged).toHaveBeenCalledWith({ sourcePath: 'books/a.epub' });
	});

	it('notifies onChanged subscribers after flush', async () => {
		const app = createMockApp(rootDir);
		const eventBus = new EventBus();
		const store = ReadingStateStoreImpl.create(app, eventBus);
		await store.load();
		const callback = vi.fn();
		store.onChanged(callback);
		await store.upsert(sampleState('books/a.epub'));
		await store.flush();

		expect(callback).toHaveBeenCalled();
	});
});
