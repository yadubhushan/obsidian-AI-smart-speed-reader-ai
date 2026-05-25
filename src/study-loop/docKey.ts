/**
 * Must stay in sync with plato-the-ai-tutor/src/study-loop/docKey.ts
 */
export function studyLoopDocKey(sourcePath: string): string {
	const normalized = sourcePath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
	const bytes = new TextEncoder().encode(normalized);
	let binary = '';
	for (const b of bytes) {
		binary += String.fromCharCode(b);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
