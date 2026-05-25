import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import type { DataAdapter } from 'obsidian';

/** Node fs-backed DataAdapter for read-cache path tests. */
export function createNodeDataAdapter(rootDir: string): DataAdapter {
	const resolvePath = (path: string): string => {
		const normalized = path.replace(/\\/g, '/');
		const root = rootDir.replace(/\\/g, '/');
		if (normalized.startsWith(root)) {
			return path;
		}
		return join(rootDir, path.replace(/^\//, ''));
	};

	return {
		async exists(path: string): Promise<boolean> {
			try {
				await readFile(resolvePath(path));
				return true;
			} catch {
				try {
					await readdir(resolvePath(path));
					return true;
				} catch {
					return false;
				}
			}
		},
		async read(path: string): Promise<string> {
			return readFile(resolvePath(path), 'utf8');
		},
		async readBinary(path: string): Promise<ArrayBuffer> {
			const buf = await readFile(resolvePath(path));
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		},
		async write(path: string, data: string): Promise<void> {
			const full = resolvePath(path);
			await mkdir(join(full, '..'), { recursive: true });
			await writeFile(full, data, 'utf8');
		},
		async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
			const full = resolvePath(path);
			await mkdir(join(full, '..'), { recursive: true });
			await writeFile(full, Buffer.from(data));
		},
		async append(): Promise<void> {
			throw new Error('not implemented');
		},
		async getResourcePath(): Promise<string> {
			throw new Error('not implemented');
		},
		async list(path: string): Promise<{ files: string[]; folders: string[] }> {
			const full = resolvePath(path);
			const entries = await readdir(full, { withFileTypes: true });
			const files: string[] = [];
			const folders: string[] = [];
			for (const entry of entries) {
				const child = join(full, entry.name).replace(/\\/g, '/');
				if (entry.isDirectory()) {
					folders.push(child);
				} else {
					files.push(child);
				}
			}
			return { files, folders };
		},
		async mkdir(path: string): Promise<void> {
			await mkdir(resolvePath(path), { recursive: true });
		},
		async remove(path: string): Promise<void> {
			await rm(resolvePath(path), { force: true });
		},
		async rename(from: string, to: string): Promise<void> {
			await mkdir(join(resolvePath(to), '..'), { recursive: true });
			await rename(resolvePath(from), resolvePath(to));
		},
		async rmdir(path: string, recursive?: boolean): Promise<void> {
			await rm(resolvePath(path), { recursive: recursive ?? true, force: true });
		},
		async stat() {
			throw new Error('not implemented');
		}
	} as DataAdapter;
}
