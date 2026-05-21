/** Minimal adapter surface for recursive folder creation. */
export interface MkdirAdapter {
	mkdir(path: string): Promise<void>;
}

/**
 * Creates each path segment under the vault (Obsidian mobile does not mkdir -p).
 * Use before writing a file or creating a nested plugin data folder.
 */
export async function ensureFolderPath(
	adapter: MkdirAdapter,
	dirPath: string
): Promise<void> {
	const normalized = dirPath.replace(/\\/g, '/').replace(/\/+$/, '');
	if (!normalized.length) {
		return;
	}
	const parts = normalized.split('/').filter((part) => part.length > 0);
	let current = '';
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		await adapter.mkdir(current).catch(() => undefined);
	}
}

/** Ensures parent directories exist for a file path (e.g. `.../data/llm-models.json`). */
export async function ensureParentFolderForFile(
	adapter: MkdirAdapter,
	filePath: string
): Promise<void> {
	const normalized = filePath.replace(/\\/g, '/');
	const parent = normalized.replace(/\/[^/]+$/, '');
	if (!parent.length || parent === normalized) {
		return;
	}
	await ensureFolderPath(adapter, parent);
}
