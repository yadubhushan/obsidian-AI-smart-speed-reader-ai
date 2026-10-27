// @vitest-environment jsdom
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/services/eventBus';
import { BookCacheStoreImpl } from '../src/store/BookCacheStore';
import { createPluginDataPaths } from '../src/store/pluginDataPaths';
import { docKeyFromSourcePath } from '../src/store/docKey';
import { bookCacheCustomCoverPath, bookCacheIndexPath } from '../src/store/bookCachePaths';
import { createEpubSourceFormatProcessor } from '../src/formats/epub/epubSourceFormatProcessor';
import { createNodeDataAdapter } from './nodeDataAdapter';
import { buildMinimalEpubBytes } from './epubFixtures';
import type { App } from 'obsidian';

function createMockApp(rootDir: string, epubPath: string, bytes: ArrayBuffer): App {
	const adapter = createNodeDataAdapter(rootDir);
	return {
		vault: {
			configDir: join(rootDir, '.obsidian'),
			adapter: {
				...adapter,
				async readBinary(path: string): Promise<ArrayBuffer> {
					if (path === epubPath) {
						return bytes;
					}
					return adapter.readBinary(path);
				}
			}
		}
	} as App;
}

describe('BookCacheStore', () => {
	let rootDir: string;
	const sourcePath = 'books/sample.epub';

	beforeEach(async () => {
		rootDir = await mkdtemp(join(tmpdir(), 'speed-reader-book-cache-'));
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	it('writes index on first parse and returns cache on second call', async () => {
		const bytes = await buildMinimalEpubBytes();
		const adapter = createNodeDataAdapter(rootDir);
		await adapter.writeBinary(sourcePath, bytes);

		const app = createMockApp(rootDir, sourcePath, bytes);
		const eventBus = new EventBus();
		const onUpdated = vi.fn();
		eventBus.on('book-cache-updated', onUpdated);
		const processor = createEpubSourceFormatProcessor(app);
		const paths = createPluginDataPaths(app.vault.configDir, 'speed-reader-ai');
		const store = new BookCacheStoreImpl(
			app,
			processor,
			eventBus,
			paths.bookCacheBase
		);

		const first = await store.ensureParsed(sourcePath);
		const second = await store.ensureParsed(sourcePath);

		expect(second.sourceChecksum).toBe(first.sourceChecksum);
		expect(onUpdated).toHaveBeenCalledTimes(1);

		const docKey = docKeyFromSourcePath(sourcePath);
		const cached = await store.get(docKey);
		expect(cached?.title).toBe(first.title);
		expect(cached?.chapters.length).toBe(first.chapters.length);
	});

	it('re-parses when source bytes change', async () => {
		const bytesV1 = await buildMinimalEpubBytes({ title: 'Version One' });
		const bytesV2 = await buildMinimalEpubBytes({ title: 'Version Two' });
		const adapter = createNodeDataAdapter(rootDir);
		await adapter.writeBinary(sourcePath, bytesV1);

		let currentBytes = bytesV1;
		const app = {
			vault: {
				configDir: join(rootDir, '.obsidian'),
				adapter: {
					...adapter,
					async readBinary(path: string): Promise<ArrayBuffer> {
						if (path === sourcePath) {
							return currentBytes;
						}
						return adapter.readBinary(path);
					}
				}
			}
		} as App;

		const paths = createPluginDataPaths(app.vault.configDir, 'speed-reader-ai');
		const store = new BookCacheStoreImpl(
			app,
			createEpubSourceFormatProcessor(app),
			new EventBus(),
			paths.bookCacheBase
		);

		const first = await store.ensureParsed(sourcePath);
		expect(first.title).toBe('Version One');

		currentBytes = bytesV2;
		const second = await store.ensureParsed(sourcePath);
		expect(second.title).toBe('Version Two');
		expect(second.sourceChecksum).not.toBe(first.sourceChecksum);
	});

	it('returns captured cache when the source EPUB has been deleted', async () => {
		const bytes = await buildMinimalEpubBytes({ title: 'Captured Book' });
		const adapter = createNodeDataAdapter(rootDir);
		await adapter.writeBinary(sourcePath, bytes);

		const app = createMockApp(rootDir, sourcePath, bytes);

		const eventBus = new EventBus();
		const onUpdated = vi.fn();
		eventBus.on('book-cache-updated', onUpdated);
		const paths = createPluginDataPaths(app.vault.configDir, 'speed-reader-ai');
		const store = new BookCacheStoreImpl(
			app,
			createEpubSourceFormatProcessor(app),
			eventBus,
			paths.bookCacheBase
		);

		const captured = await store.ensureParsed(sourcePath);
		await adapter.remove(sourcePath);
		const reopened = await store.ensureParsed(sourcePath);

		expect(reopened.title).toBe('Captured Book');
		expect(reopened.sourceChecksum).toBe(captured.sourceChecksum);
		expect(onUpdated).toHaveBeenCalledTimes(1);
	});

	describe('rebuild', () => {
		async function setup(title = 'Rebuild Book') {
			const bytes = await buildMinimalEpubBytes({ title });
			const adapter = createNodeDataAdapter(rootDir);
			await adapter.writeBinary(sourcePath, bytes);
			const app = createMockApp(rootDir, sourcePath, bytes);
			const eventBus = new EventBus();
			const onUpdated = vi.fn();
			eventBus.on('book-cache-updated', onUpdated);
			const paths = createPluginDataPaths(app.vault.configDir, 'speed-reader-ai');
			const store = new BookCacheStoreImpl(
				app,
				createEpubSourceFormatProcessor(app),
				eventBus,
				paths.bookCacheBase
			);
			const docKey = docKeyFromSourcePath(sourcePath);
			return { adapter, store, onUpdated, base: paths.bookCacheBase, docKey };
		}

		it('re-parses unchanged bytes and replaces a damaged index', async () => {
			const { adapter, store, onUpdated, base, docKey } = await setup();
			const original = await store.ensureParsed(sourcePath);
			const indexPath = bookCacheIndexPath(base, docKey);
			await adapter.write(
				indexPath,
				JSON.stringify({ ...original, title: 'Damaged', chapters: [] })
			);

			const rebuilt = await store.rebuild(sourcePath);

			expect(onUpdated).toHaveBeenCalledTimes(2);
			expect(rebuilt.title).toBe('Rebuild Book');
			expect(rebuilt.sourceChecksum).toBe(original.sourceChecksum);
			const cached = await store.get(docKey);
			expect(cached?.title).toBe('Rebuild Book');
			expect(cached?.chapters.length).toBe(original.chapters.length);
		});

		it('keeps the user-picked custom cover', async () => {
			const { adapter, store, base, docKey } = await setup();
			await store.ensureParsed(sourcePath);
			const customCover = bookCacheCustomCoverPath(base, docKey);
			await adapter.writeBinary(customCover, new Uint8Array([1, 2, 3]).buffer);

			await store.rebuild(sourcePath);

			expect(await adapter.exists(customCover)).toBe(true);
		});

		it('throws and leaves the cache untouched when the EPUB is missing', async () => {
			const { adapter, store, onUpdated, base, docKey } = await setup('Only Copy');
			await store.ensureParsed(sourcePath);
			const before = await adapter.read(bookCacheIndexPath(base, docKey));
			await adapter.remove(sourcePath);

			await expect(store.rebuild(sourcePath)).rejects.toThrow('EPUB file not found');

			expect(await adapter.read(bookCacheIndexPath(base, docKey))).toBe(before);
			expect(onUpdated).toHaveBeenCalledTimes(1);
		});
	});
});
