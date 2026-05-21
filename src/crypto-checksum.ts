function bytesToHex(buf: ArrayBuffer): string {
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** SHA-256 hex of UTF-8 body; matches Python `content_checksum` (ml_srs.qa_pipeline). */
export async function contentChecksum(markdownBody: string): Promise<string> {
	const enc = new TextEncoder().encode(markdownBody);
	const buf = await crypto.subtle.digest('SHA-256', enc);
	return bytesToHex(buf);
}

/** SHA-256 hex of raw binary (e.g. EPUB file bytes). */
export async function binaryChecksum(data: ArrayBuffer): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', data);
	return bytesToHex(buf);
}
