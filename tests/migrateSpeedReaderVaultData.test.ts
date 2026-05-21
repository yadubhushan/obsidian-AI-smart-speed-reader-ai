import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bookCacheBasePath } from '../src/store/bookCachePaths';
import { migrateSpeedReaderVaultData } from '../src/store/migrateSpeedReaderVaultData';
import { listReadCacheDocKeys, readCacheBasePath } from '../src/store/readCachePaths';
import { readingStateFilePath } from '../src/store/readingStatePaths';
import { createNodeDataAdapter } from './nodeDataAdapter';

describe('migrateSpeedReaderVaultData', () => {
	let rootDir: string;
	const configDir = () => join(rootDir, '.obsidian');

	beforeEach(async () => {
		rootDir = await mkdtemp(join(tmpdir(), 'speed-reader-vault-migrate-'));
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	it('copies legacy read-cache into .speedreader when new cache is empty', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const legacyBase = join(rootDir, '.obsidian/speed-reader-ai/read-cache');
		await mkdir(join(legacyBase, 'doc-legacy', 'modes'), { recursive: true });
		await writeFile(join(legacyBase, 'doc-legacy/index.json'), '{"version":1}');

		const result = await migrateSpeedReaderVaultData(adapter, configDir());
		expect(result.readCache).toBe(true);

		const keys = await listReadCacheDocKeys(adapter, readCacheBasePath());
		expect(keys).toEqual(['doc-legacy']);
	});

	it('copies legacy reading-state.json when new file is missing', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const legacyDir = join(rootDir, '.obsidian/speed-reader-ai/data');
		await mkdir(legacyDir, { recursive: true });
		const legacyPayload = JSON.stringify({ lastGlobalSourcePath: 'notes/a.md', sources: {} });
		await writeFile(join(legacyDir, 'reading-state.json'), legacyPayload);

		const result = await migrateSpeedReaderVaultData(adapter, configDir());
		expect(result.readingState).toBe(true);

		const raw = await readFile(join(rootDir, readingStateFilePath()), 'utf8');
		expect(JSON.parse(raw).lastGlobalSourcePath).toBe('notes/a.md');
	});

	it('does not overwrite existing .speedreader read-cache', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const newBase = join(rootDir, readCacheBasePath());
		await mkdir(join(newBase, 'already-here'), { recursive: true });

		const legacyBase = join(rootDir, '.obsidian/speed-reader-ai/read-cache');
		await mkdir(join(legacyBase, 'legacy-only'), { recursive: true });

		const result = await migrateSpeedReaderVaultData(adapter, configDir());
		expect(result.readCache).toBe(false);

		const keys = await listReadCacheDocKeys(adapter, readCacheBasePath());
		expect(keys).toEqual(['already-here']);
	});

	it('copies legacy book-cache into .speedreader/book-cache', async () => {
		const adapter = createNodeDataAdapter(rootDir);
		const legacyBase = join(rootDir, '.obsidian/speed-reader-ai/data/book-cache');
		await mkdir(join(legacyBase, 'book-one'), { recursive: true });
		await writeFile(join(legacyBase, 'book-one/index.json'), '{}');

		const result = await migrateSpeedReaderVaultData(adapter, configDir());
		expect(result.bookCache).toBe(true);

		const listed = await adapter.list(join(rootDir, bookCacheBasePath()));
		expect(listed.folders.some((f) => f.endsWith('book-one'))).toBe(true);
	});
});
