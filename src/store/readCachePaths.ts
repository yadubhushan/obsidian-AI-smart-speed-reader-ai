import type { DataAdapter } from 'obsidian';
import { joinSpeedReaderVaultPath } from './speedReaderVaultPaths';

/** AI prepare cache (manifests, section JSON) under `.speedreader/read-cache/`. */
export function readCacheBasePath(): string {
	return joinSpeedReaderVaultPath('read-cache');
}

function joinCachePath(basePath: string, relativePath?: string): string {
	const base = basePath.replace(/\\/g, '/').replace(/\/+$/, '');
	if (!relativePath?.length) {
		return base;
	}
	const rel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
	return `${base}/${rel}`;
}

function entryName(entry: string): string {
	const parts = entry.replace(/\\/g, '/').split('/');
	return parts[parts.length - 1] ?? entry;
}

/**
 * Recursively remove read-cache files and folders under basePath.
 * When relativePath is omitted, clears all children under the read-cache base (keeps base dir).
 * When relativePath is set (e.g. docKey), removes that subtree including the folder.
 */
export async function removeReadCacheTree(
	adapter: DataAdapter,
	basePath: string,
	relativePath?: string
): Promise<void> {
	const fullPath = joinCachePath(basePath, relativePath);
	let listed: { files: string[]; folders: string[] };
	try {
		listed = await adapter.list(fullPath);
	} catch {
		return;
	}

	for (const file of listed.files) {
		const filePath = file.startsWith(fullPath)
			? file
			: joinCachePath(fullPath, entryName(file));
		await adapter.remove(filePath).catch(() => undefined);
	}
	for (const folder of listed.folders) {
		const name = entryName(folder);
		const childRel = relativePath ? `${relativePath}/${name}` : name;
		await removeReadCacheTree(adapter, basePath, childRel);
	}

	if (relativePath) {
		await adapter.rmdir(fullPath, true).catch(() => undefined);
	}
}

/** Top-level doc-key folder names under read-cache. */
export async function listReadCacheDocKeys(
	adapter: DataAdapter,
	basePath: string
): Promise<string[]> {
	const fullPath = joinCachePath(basePath);
	try {
		const listed = await adapter.list(fullPath);
		return listed.folders.map(entryName);
	} catch {
		return [];
	}
}

export async function readCacheDocKeyExists(
	adapter: DataAdapter,
	basePath: string,
	docKey: string
): Promise<boolean> {
	const fullPath = joinCachePath(basePath, docKey);
	try {
		const listed = await adapter.list(fullPath);
		return listed.files.length > 0 || listed.folders.length > 0;
	} catch {
		return false;
	}
}
