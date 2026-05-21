import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	listReadCacheDocKeys,
	readCacheBasePath,
	readCacheDocKeyExists,
	removeReadCacheTree
} from '../src/store/readCachePaths';
import { createNodeDataAdapter } from './nodeDataAdapter';

describe('readCachePaths', () => {
	let rootDir: string;
	let adapter: ReturnType<typeof createNodeDataAdapter>;

	beforeEach(async () => {
		rootDir = await mkdtemp(join(tmpdir(), 'read-cache-paths-'));
		adapter = createNodeDataAdapter(rootDir);
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	it('readCacheBasePath resolves under .speedreader in the vault', () => {
		expect(readCacheBasePath()).toBe('.speedreader/read-cache');
	});

	it('listReadCacheDocKeys returns top-level doc folders only', async () => {
		await mkdir(join(rootDir, 'doc-a', 'modes', 'sections'), { recursive: true });
		await mkdir(join(rootDir, 'doc-b'), { recursive: true });
		await writeFile(join(rootDir, 'stray.txt'), 'x');

		const keys = await listReadCacheDocKeys(adapter, rootDir);
		expect(keys.sort()).toEqual(['doc-a', 'doc-b']);
	});

	it('removeReadCacheTree removes nested mode files for one doc', async () => {
		const docKey = 'doc-one';
		await mkdir(join(rootDir, docKey, 'modes', 'sections', 'sections'), {
			recursive: true
		});
		await writeFile(join(rootDir, docKey, 'index.json'), '{}');
		await writeFile(
			join(rootDir, docKey, 'modes', 'sections', 'sections', 's1.json'),
			'{}'
		);

		expect(await readCacheDocKeyExists(adapter, rootDir, docKey)).toBe(true);
		await removeReadCacheTree(adapter, rootDir, docKey);
		expect(await readCacheDocKeyExists(adapter, rootDir, docKey)).toBe(false);
	});

	it('removeReadCacheTree without relativePath clears all doc folders', async () => {
		await mkdir(join(rootDir, 'doc-a'), { recursive: true });
		await mkdir(join(rootDir, 'doc-b'), { recursive: true });

		await removeReadCacheTree(adapter, rootDir);
		const keys = await listReadCacheDocKeys(adapter, rootDir);
		expect(keys).toEqual([]);
	});
});
