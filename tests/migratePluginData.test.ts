import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPluginDataPaths } from '../src/store/pluginDataPaths';
import { migratePluginData } from '../src/store/migratePluginData';
import { listReadCacheDocKeys } from '../src/store/readCachePaths';
import { createNodeDataAdapter } from './nodeDataAdapter';

const PLUGIN_ID = 'speed-reader-ai';

describe('migratePluginData', () => {
	let rootDir: string;
	const configDir = () => join(rootDir, '.obsidian');
	const dataPaths = () => createPluginDataPaths(configDir(), PLUGIN_ID);

	beforeEach(async () => {
		rootDir = await mkdtemp(join(tmpdir(), 'speed-reader-plugin-migrate-'));
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	it('copies .speedreader read-cache into plugin data when target is empty', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const vaultBase = join(rootDir, '.speedreader/read-cache');
		await mkdir(join(vaultBase, 'doc-vault', 'modes'), { recursive: true });
		await writeFile(join(vaultBase, 'doc-vault/index.json'), '{"version":1}');

		const result = await migratePluginData(adapter, configDir(), PLUGIN_ID);
		expect(result.readCache).toBe(true);

		const keys = await listReadCacheDocKeys(adapter, dataPaths().readCacheBase);
		expect(keys).toEqual(['doc-vault']);
	});

	it('copies legacy read-cache into plugin data when .speedreader is empty', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const legacyBase = join(rootDir, '.obsidian/speed-reader-ai/read-cache');
		await mkdir(join(legacyBase, 'doc-legacy', 'modes'), { recursive: true });
		await writeFile(join(legacyBase, 'doc-legacy/index.json'), '{"version":1}');

		const result = await migratePluginData(adapter, configDir(), PLUGIN_ID);
		expect(result.readCache).toBe(true);

		const keys = await listReadCacheDocKeys(adapter, dataPaths().readCacheBase);
		expect(keys).toEqual(['doc-legacy']);
	});

	it('does not copy legacy reading-state.json', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const vaultDir = join(rootDir, '.speedreader');
		await mkdir(vaultDir, { recursive: true });
		await writeFile(
			join(vaultDir, 'reading-state.json'),
			JSON.stringify({
				lastGlobalSourcePath: 'notes/a.md',
				sources: { 'notes/a.md': { sourceKind: 'note' } }
			})
		);

		const result = await migratePluginData(adapter, configDir(), PLUGIN_ID);
		expect(result.readingState).toBe(false);

		expect(await adapter.exists(dataPaths().readingStateFile)).toBe(false);
	});

	it('does not overwrite existing plugin read-cache', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const newBase = join(rootDir, dataPaths().readCacheBase);
		await mkdir(join(newBase, 'already-here'), { recursive: true });

		const vaultBase = join(rootDir, '.speedreader/read-cache');
		await mkdir(join(vaultBase, 'vault-only'), { recursive: true });

		const result = await migratePluginData(adapter, configDir(), PLUGIN_ID);
		expect(result.readCache).toBe(false);

		const keys = await listReadCacheDocKeys(adapter, dataPaths().readCacheBase);
		expect(keys).toEqual(['already-here']);
	});

	it('copies .speedreader book-cache into plugin data', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const vaultBase = join(rootDir, '.speedreader/book-cache');
		await mkdir(join(vaultBase, 'book-one'), { recursive: true });
		await writeFile(join(vaultBase, 'book-one/index.json'), '{}');

		const result = await migratePluginData(adapter, configDir(), PLUGIN_ID);
		expect(result.bookCache).toBe(true);

		const listed = await adapter.list(join(rootDir, dataPaths().bookCacheBase));
		expect(listed.folders.some((f) => f.endsWith('book-one'))).toBe(true);
	});
});
