import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
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

	it('copies .speedreader reading-state.json when target is missing', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const vaultDir = join(rootDir, '.speedreader');
		await mkdir(vaultDir, { recursive: true });
		const payload = JSON.stringify({
			lastGlobalSourcePath: 'notes/a.md',
			sources: {
				'notes/a.md': {
					sourcePath: 'notes/a.md',
					sourceKind: 'note',
					title: 'A',
					folder: 'notes',
					sourceChecksum: 'abc',
					lastOpenedAt: '2026-05-22T00:00:00.000Z',
					pinned: false,
					status: 'in_progress',
					playbackMode: 'rsvp',
					position: { sectionId: '00-document', wordIndex: 1 },
					progressPercent: 1
				}
			}
		});
		await writeFile(join(vaultDir, 'reading-state.json'), payload);

		const result = await migratePluginData(adapter, configDir(), PLUGIN_ID);
		expect(result.readingState).toBe(true);

		const raw = await readFile(join(rootDir, dataPaths().readingStateFile), 'utf8');
		expect(JSON.parse(raw).lastGlobalSourcePath).toBe('notes/a.md');
	});

	it('copies .speedreader reading-state.json when plugin target exists but is empty', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const vaultDir = join(rootDir, '.speedreader');
		await mkdir(vaultDir, { recursive: true });
		const legacyPayload = JSON.stringify({
			lastGlobalSourcePath: 'docs/Areas/social-skills/note.md',
			sources: {
				'docs/Areas/social-skills/note.md': {
					sourcePath: 'docs/Areas/social-skills/note.md',
					sourceKind: 'note',
					title: 'Note',
					folder: 'docs/Areas/social-skills',
					sourceChecksum: 'abc',
					lastOpenedAt: '2026-05-22T00:00:00.000Z',
					pinned: false,
					status: 'in_progress',
					playbackMode: 'rsvp',
					position: { sectionId: '00-document', wordIndex: 10 },
					progressPercent: 5
				}
			}
		});
		await writeFile(join(vaultDir, 'reading-state.json'), legacyPayload);

		const pluginStatePath = join(rootDir, dataPaths().readingStateFile);
		await mkdir(join(pluginStatePath, '..'), { recursive: true });
		await writeFile(
			pluginStatePath,
			JSON.stringify({ lastGlobalSourcePath: '', sources: {} })
		);

		const result = await migratePluginData(adapter, configDir(), PLUGIN_ID);
		expect(result.readingState).toBe(true);

		const raw = await readFile(pluginStatePath, 'utf8');
		const parsed = JSON.parse(raw) as {
			lastGlobalSourcePath: string;
			sources: Record<string, unknown>;
		};
		expect(parsed.lastGlobalSourcePath).toBe('docs/Areas/social-skills/note.md');
		expect(Object.keys(parsed.sources)).toHaveLength(1);
	});

	it('does not overwrite plugin reading-state when it already has sources', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const vaultDir = join(rootDir, '.speedreader');
		await mkdir(vaultDir, { recursive: true });
		await writeFile(
			join(vaultDir, 'reading-state.json'),
			JSON.stringify({
				lastGlobalSourcePath: 'legacy/note.md',
				sources: { 'legacy/note.md': { sourceKind: 'note' } }
			})
		);

		const pluginStatePath = join(rootDir, dataPaths().readingStateFile);
		await mkdir(join(pluginStatePath, '..'), { recursive: true });
		await writeFile(
			pluginStatePath,
			JSON.stringify({
				lastGlobalSourcePath: 'plugin/note.md',
				sources: { 'plugin/note.md': { sourceKind: 'note' } }
			})
		);

		const result = await migratePluginData(adapter, configDir(), PLUGIN_ID);
		expect(result.readingState).toBe(false);

		const raw = await readFile(pluginStatePath, 'utf8');
		expect(JSON.parse(raw).lastGlobalSourcePath).toBe('plugin/note.md');
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
