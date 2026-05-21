/**
 * Derive a stable, filesystem-safe cache key from a vault-relative source path.
 * Uses base64url encoding of the normalized path (no slashes in key).
 */
export function docKeyFromSourcePath(sourcePath: string): string {
	const normalized = sourcePath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
	const bytes = new TextEncoder().encode(normalized);
	let binary = '';
	for (const b of bytes) {
		binary += String.fromCharCode(b);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
