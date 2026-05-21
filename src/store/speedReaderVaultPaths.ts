/** Vault-visible root for all Speed Reader AI persisted data (syncs with the vault). */
export const SPEED_READER_VAULT_ROOT = '.speedreader';

export function speedReaderVaultRoot(): string {
	return SPEED_READER_VAULT_ROOT;
}

export function joinSpeedReaderVaultPath(...parts: string[]): string {
	const segments = [SPEED_READER_VAULT_ROOT, ...parts]
		.map((p) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
		.filter((p) => p.length > 0);
	return segments.join('/');
}

/** Relative path shown in settings UI. */
export function speedReaderReadCacheDisplayPath(): string {
	return `${joinSpeedReaderVaultPath('read-cache')}/`;
}
