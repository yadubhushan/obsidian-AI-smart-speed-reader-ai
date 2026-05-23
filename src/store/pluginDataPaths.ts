/** Previous vault-root location (migrated on load; not written after upgrade). */
export const LEGACY_SPEED_READER_VAULT_ROOT = '.speedreader';

export interface PluginDataPaths {
	dataRoot: string;
	readingStateFile: string;
	readCacheBase: string;
	bookCacheBase: string;
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '');
}

function joinPath(...parts: string[]): string {
	return normalizePath(
		parts
			.map((p) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
			.filter((p) => p.length > 0)
			.join('/')
	);
}

/** Plugin-scoped data under `{configDir}/plugins/{pluginId}/data/`. */
export function createPluginDataPaths(configDir: string, pluginId: string): PluginDataPaths {
	const dataRoot = joinPath(configDir, 'plugins', pluginId, 'data');
	return {
		dataRoot,
		readingStateFile: joinPath(dataRoot, 'reading-state.json'),
		readCacheBase: joinPath(dataRoot, 'read-cache'),
		bookCacheBase: joinPath(dataRoot, 'book-cache')
	};
}

/** Relative path shown in settings UI. */
export function pluginReadCacheDisplayPath(paths: PluginDataPaths): string {
	return `${paths.readCacheBase.replace(/\\/g, '/')}/`;
}

export function legacySpeedReaderVaultReadCachePath(): string {
	return joinPath(LEGACY_SPEED_READER_VAULT_ROOT, 'read-cache');
}

export function legacySpeedReaderVaultBookCachePath(): string {
	return joinPath(LEGACY_SPEED_READER_VAULT_ROOT, 'book-cache');
}

export function legacySpeedReaderVaultReadingStatePath(): string {
	return joinPath(LEGACY_SPEED_READER_VAULT_ROOT, 'reading-state.json');
}
