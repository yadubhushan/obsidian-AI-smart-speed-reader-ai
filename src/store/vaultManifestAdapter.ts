import type { DataAdapter } from 'obsidian';
import type { ManifestStoreAdapter } from './ManifestStore';

function joinBase(base: string, relative: string): string {
	const b = base.replace(/\\/g, '/').replace(/\/+$/, '');
	const r = relative.replace(/\\/g, '/').replace(/^\/+/, '');
	return r.length ? `${b}/${r}` : b;
}

/** Obsidian vault adapter rooted at `.speedreader/read-cache/`. */
export function createVaultManifestAdapter(
	adapter: DataAdapter,
	readCacheBasePath: string
): ManifestStoreAdapter {
	const base = readCacheBasePath.replace(/\\/g, '/').replace(/\/+$/, '');

	return {
		async exists(path: string): Promise<boolean> {
			return adapter.exists(joinBase(base, path));
		},
		async read(path: string): Promise<string> {
			return adapter.read(joinBase(base, path));
		},
		async write(path: string, data: string): Promise<void> {
			await adapter.write(joinBase(base, path), data);
		},
		async mkdir(path: string): Promise<void> {
			const full = joinBase(base, path);
			const parent = full.replace(/[/\\][^/\\]+$/, '');
			if (parent && parent !== full) {
				await adapter.mkdir(parent).catch(() => undefined);
			}
			await adapter.mkdir(full).catch(() => undefined);
		},
		async remove(path: string): Promise<void> {
			await adapter.remove(joinBase(base, path));
		},
		async list(path: string): Promise<string[]> {
			const listed = await adapter.list(joinBase(base, path));
			return listed.files;
		}
	};
}
