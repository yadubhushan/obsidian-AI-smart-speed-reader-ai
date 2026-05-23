// @vitest-environment jsdom
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/services/eventBus';
import { BookCacheStoreImpl } from '../src/store/BookCacheStore';
import { createPluginDataPaths } from '../src/store/pluginDataPaths';
import { docKeyFromSourcePath } from '../src/store/docKey';
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
});
