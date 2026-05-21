import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { ManifestStoreAdapter } from '../src/store/ManifestStore';

/** In-memory + Node fs adapter for ManifestStore unit tests. */
export function createNodeManifestAdapter(rootDir: string): ManifestStoreAdapter {
	const resolve = (p: string) => join(rootDir, p.replace(/\\/g, '/'));

	return {
		async exists(path: string): Promise<boolean> {
			try {
				await readFile(resolve(path));
				return true;
			} catch {
				return false;
			}
		},
		async read(path: string): Promise<string> {
			return readFile(resolve(path), 'utf8');
		},
		async write(path: string, data: string): Promise<void> {
			const full = resolve(path);
			await mkdir(dirname(full), { recursive: true });
			await writeFile(full, data, 'utf8');
		},
		async mkdir(path: string): Promise<void> {
			await mkdir(resolve(path), { recursive: true });
		},
		async remove(path: string): Promise<void> {
			await rm(resolve(path), { recursive: true, force: true });
		},
		async list(path: string): Promise<string[]> {
			try {
				return await readdir(resolve(path));
			} catch {
				return [];
			}
		}
	};
}
