import type { DataAdapter } from 'obsidian';
import { bookCacheBasePath } from './bookCachePaths';
import { listReadCacheDocKeys, readCacheBasePath } from './readCachePaths';
import { readingStateFilePath } from './readingStatePaths';
import { speedReaderVaultRoot } from './speedReaderVaultPaths';

function normalizeConfigDir(configDir: string): string {
	return configDir.replace(/\\/g, '/').replace(/\/+$/, '');
}

function legacyReadCachePath(configDir: string): string {
	return `${normalizeConfigDir(configDir)}/speed-reader-ai/read-cache`;
}

function legacyBookCachePath(configDir: string): string {
	return `${normalizeConfigDir(configDir)}/speed-reader-ai/data/book-cache`;
}

function legacyReadingStatePath(configDir: string): string {
	return `${normalizeConfigDir(configDir)}/speed-reader-ai/data/reading-state.json`;
}

function entryName(entry: string): string {
	const parts = entry.replace(/\\/g, '/').split('/');
	return parts[parts.length - 1] ?? entry;
}

async function listTopLevelFolders(adapter: DataAdapter, basePath: string): Promise<string[]> {
	try {
		const listed = await adapter.list(basePath);
		return listed.folders.map(entryName);
	} catch {
		return [];
	}
}

async function copyFile(adapter: DataAdapter, fromPath: string, toPath: string): Promise<void> {
	const data = await adapter.read(fromPath);
	const parent = toPath.replace(/[/\\][^/\\]+$/, '');
	if (parent && parent !== toPath) {
		await adapter.mkdir(parent).catch(() => undefined);
	}
	await adapter.write(toPath, data);
}

async function copyTree(adapter: DataAdapter, fromBase: string, toBase: string): Promise<void> {
	let listed: { files: string[]; folders: string[] };
	try {
		listed = await adapter.list(fromBase);
	} catch {
		return;
	}

	for (const file of listed.files) {
		const name = entryName(file);
		const fromPath = file.startsWith(fromBase) ? file : `${fromBase}/${name}`;
		const toPath = `${toBase}/${name}`;
		await copyFile(adapter, fromPath, toPath);
	}

	for (const folder of listed.folders) {
		const name = entryName(folder);
		await copyTree(adapter, `${fromBase}/${name}`, `${toBase}/${name}`);
	}
}

async function migrateDirectoryIfEmpty(
	adapter: DataAdapter,
	fromPath: string,
	toPath: string,
	listKeys: (adapter: DataAdapter, base: string) => Promise<string[]>
): Promise<boolean> {
	const existing = await listKeys(adapter, toPath);
	if (existing.length > 0) {
		return false;
	}
	const legacy = await listKeys(adapter, fromPath);
	if (legacy.length === 0) {
		return false;
	}
	await adapter.mkdir(speedReaderVaultRoot()).catch(() => undefined);
	await adapter.mkdir(toPath).catch(() => undefined);
	await copyTree(adapter, fromPath, toPath);
	return true;
}

async function migrateReadingStateFile(
	adapter: DataAdapter,
	fromPath: string,
	toPath: string
): Promise<boolean> {
	if (await adapter.exists(toPath)) {
		return false;
	}
	if (!(await adapter.exists(fromPath))) {
		return false;
	}
	await adapter.mkdir(speedReaderVaultRoot()).catch(() => undefined);
	await copyFile(adapter, fromPath, toPath);
	return true;
}

export interface SpeedReaderVaultMigrationResult {
	readCache: boolean;
	bookCache: boolean;
	readingState: boolean;
}

/**
 * One-time copy from legacy `.obsidian/speed-reader-ai/...` into `.speedreader/`
 * when the new location is still empty.
 */
export async function migrateSpeedReaderVaultData(
	adapter: DataAdapter,
	vaultConfigDir: string
): Promise<SpeedReaderVaultMigrationResult> {
	const configDir = normalizeConfigDir(vaultConfigDir);
	const readCache = await migrateDirectoryIfEmpty(
		adapter,
		legacyReadCachePath(configDir),
		readCacheBasePath(),
		listReadCacheDocKeys
	);
	const bookCache = await migrateDirectoryIfEmpty(
		adapter,
		legacyBookCachePath(configDir),
		bookCacheBasePath(),
		listTopLevelFolders
	);
	const readingState = await migrateReadingStateFile(
		adapter,
		legacyReadingStatePath(configDir),
		readingStateFilePath()
	);

	return { readCache, bookCache, readingState };
}
