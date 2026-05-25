import type { DataAdapter } from 'obsidian';

export interface VaultFileAdapter {
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	mkdir(path: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	rename(from: string, to: string): Promise<void>;
	remove(path: string): Promise<void>;
}

export function wrapDataAdapter(adapter: DataAdapter): VaultFileAdapter {
	return {
		read: (p) => adapter.read(p),
		write: (p, d) => adapter.write(p, d),
		mkdir: (p) => adapter.mkdir(p),
		exists: (p) => adapter.exists(p),
		rename: (a, b) => adapter.rename(a, b),
		remove: (p) => adapter.remove(p)
	};
}

function parentVaultPath(filePath: string): string {
	const parts = filePath.split('/').filter((p) => p.length > 0);
	parts.pop();
	return parts.join('/');
}

async function mkdirp(adapter: VaultFileAdapter, dirPath: string): Promise<void> {
	if (!dirPath) {
		return;
	}
	if (await adapter.exists(dirPath)) {
		return;
	}
	const parent = parentVaultPath(dirPath);
	if (parent && parent !== dirPath) {
		await mkdirp(adapter, parent);
	}
	try {
		await adapter.mkdir(dirPath);
	} catch {
		/* race */
	}
}

export async function atomicWriteText(
	adapter: VaultFileAdapter,
	filePath: string,
	data: string
): Promise<void> {
	const parent = parentVaultPath(filePath);
	if (parent) {
		await mkdirp(adapter, parent);
	}
	const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
	try {
		await adapter.write(tmp, data);
		if (await adapter.exists(filePath)) {
			await adapter.remove(filePath);
		}
		await adapter.rename(tmp, filePath);
	} catch (err) {
		try {
			if (await adapter.exists(tmp)) {
				await adapter.remove(tmp);
			}
		} catch {
			/* ignore */
		}
		throw err;
	}
}
