import { readableNoteBody } from './parse/segmentParser';

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

/** Copy bytes so SubtleCrypto accepts them in Node/jsdom CI (cross-realm ArrayBuffer). */
function toDigestBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
	const view =
		data instanceof ArrayBuffer
			? new Uint8Array(data)
			: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	return new Uint8Array(view);
}

/** SHA-256 hex of raw binary (e.g. EPUB file bytes). */
export async function binaryChecksum(data: ArrayBuffer | ArrayBufferView): Promise<string> {
	const bytes = toDigestBytes(data);
	const buf = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
	return bytesToHex(buf);
}

/** SHA-256 of note body excluding the configured bookmark H1 section (matches parser). */
export async function noteContentChecksum(
	markdownBody: string,
	bookmarkSectionHeading: string | undefined
): Promise<string> {
	return contentChecksum(readableNoteBody(markdownBody, bookmarkSectionHeading));
}
