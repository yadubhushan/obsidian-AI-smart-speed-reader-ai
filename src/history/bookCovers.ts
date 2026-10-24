import type { DataAdapter } from 'obsidian';
import {
	bookCacheCoverPath,
	bookCacheCustomCoverPath,
	bookCacheDocKeyPath
} from '../store/bookCachePaths';
import { ensureFolderPath } from '../utils/vaultAdapterDirs';

/** Read the user's custom cover if set, else the EPUB-extracted one, as an object URL. */
export async function loadBookCoverUrl(
	adapter: DataAdapter,
	bookCacheBase: string,
	docKey: string
): Promise<string | null> {
	const candidates = [
		bookCacheCustomCoverPath(bookCacheBase, docKey),
		bookCacheCoverPath(bookCacheBase, docKey)
	];
	for (const path of candidates) {
		try {
			if (!(await adapter.exists(path))) {
				continue;
			}
			const bytes = await adapter.readBinary(path);
			return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
		} catch {
			continue;
		}
	}
	return null;
}

export async function hasCustomBookCover(
	adapter: DataAdapter,
	bookCacheBase: string,
	docKey: string
): Promise<boolean> {
	return adapter.exists(bookCacheCustomCoverPath(bookCacheBase, docKey));
}

export async function saveCustomBookCover(
	adapter: DataAdapter,
	bookCacheBase: string,
	docKey: string,
	bytes: ArrayBuffer
): Promise<void> {
	await ensureFolderPath(adapter, bookCacheDocKeyPath(bookCacheBase, docKey));
	await adapter.writeBinary(bookCacheCustomCoverPath(bookCacheBase, docKey), bytes);
}

export async function clearCustomBookCover(
	adapter: DataAdapter,
	bookCacheBase: string,
	docKey: string
): Promise<void> {
	const path = bookCacheCustomCoverPath(bookCacheBase, docKey);
	if (await adapter.exists(path)) {
		await adapter.remove(path);
	}
}
