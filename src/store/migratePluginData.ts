import type { DataAdapter } from 'obsidian';
import { listReadCacheDocKeys } from './readCachePaths';
import {
	createPluginDataPaths,
	legacySpeedReaderVaultBookCachePath,
	legacySpeedReaderVaultReadCachePath,
	type PluginDataPaths
} from './pluginDataPaths';
import { ensureFolderPath, ensureParentFolderForFile } from '../utils/vaultAdapterDirs';

function normalizeConfigDir(configDir: string): string {
	return configDir.replace(/\\/g, '/').replace(/\/+$/, '');
}

function legacyReadCachePath(configDir: string): string {
	return `${normalizeConfigDir(configDir)}/speed-reader-ai/read-cache`;
}

function legacyBookCachePath(configDir: string): string {
	return `${normalizeConfigDir(configDir)}/speed-reader-ai/data/book-cache`;
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
	await ensureParentFolderForFile(adapter, toPath);
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

async function directoryHasContent(
	adapter: DataAdapter,
	basePath: string,
	listKeys: (adapter: DataAdapter, base: string) => Promise<string[]>
): Promise<boolean> {
	return (await listKeys(adapter, basePath)).length > 0;
}

async function migrateDirectoryFromSources(
	adapter: DataAdapter,
	toPath: string,
	fromPaths: string[],
	listKeys: (adapter: DataAdapter, base: string) => Promise<string[]>
): Promise<boolean> {
	if (await directoryHasContent(adapter, toPath, listKeys)) {
		return false;
	}

	for (const fromPath of fromPaths) {
		if (!(await directoryHasContent(adapter, fromPath, listKeys))) {
			continue;
		}
		await ensureFolderPath(adapter, toPath);
		await copyTree(adapter, fromPath, toPath);
		return true;
	}

	return false;
}

export interface PluginDataMigrationResult {
	readCache: boolean;
	bookCache: boolean;
	readingState: boolean;
}

/**
 * One-time copy into `{configDir}/plugins/{pluginId}/data/` when targets are empty.
 * Sources (in order): vault `.speedreader/`, then legacy `{configDir}/speed-reader-ai/`.
 */
export async function migratePluginData(
	adapter: DataAdapter,
	vaultConfigDir: string,
	pluginId: string
): Promise<PluginDataMigrationResult> {
	const configDir = normalizeConfigDir(vaultConfigDir);
	const paths = createPluginDataPaths(configDir, pluginId);

	const vaultReadCacheSources = [
		legacySpeedReaderVaultReadCachePath(),
		legacyReadCachePath(configDir)
	];
	const vaultBookCacheSources = [
		legacySpeedReaderVaultBookCachePath(),
		legacyBookCachePath(configDir)
	];

	const readCache = await migrateDirectoryFromSources(
		adapter,
		paths.readCacheBase,
		vaultReadCacheSources,
		listReadCacheDocKeys
	);
	const bookCache = await migrateDirectoryFromSources(
		adapter,
		paths.bookCacheBase,
		vaultBookCacheSources,
		listTopLevelFolders
	);
	const readingState = false;

	return { readCache, bookCache, readingState };
}

export type { PluginDataPaths };
