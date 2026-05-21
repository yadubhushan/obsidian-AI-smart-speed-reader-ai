import type { DataAdapter } from 'obsidian';
import { joinSpeedReaderVaultPath } from './speedReaderVaultPaths';

/** Parsed EPUB cache under `.speedreader/book-cache/`. */
export function bookCacheBasePath(): string {
	return joinSpeedReaderVaultPath('book-cache');
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

export async function removeBookCacheTree(
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
		await removeBookCacheTree(adapter, basePath, childRel);
	}

	if (relativePath) {
		await adapter.rmdir(fullPath, true).catch(() => undefined);
	}
}

export function bookCacheDocKeyPath(basePath: string, docKey: string): string {
	return joinCachePath(basePath, docKey);
}

export function bookCacheIndexPath(basePath: string, docKey: string): string {
	return joinCachePath(basePath, `${docKey}/index.json`);
}

export function bookCacheMetadataPath(basePath: string, docKey: string): string {
	return joinCachePath(basePath, `${docKey}/metadata.json`);
}

export function bookCacheCoverPath(basePath: string, docKey: string): string {
	return joinCachePath(basePath, `${docKey}/cover.jpg`);
}
