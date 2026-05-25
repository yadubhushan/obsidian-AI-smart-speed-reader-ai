import { calculateORP, splitGluedWordToken } from '../services/textParser';
import type { StreamToken } from '../types/processedDocument';

export const PARAGRAPH_PAUSE_MS = 300;

export function proseToWordTokens(text: string): StreamToken[] {
	const tokens: StreamToken[] = [];
	for (const word of text.split(/\s+/).filter(Boolean)) {
		for (const part of splitGluedWordToken(word)) {
			tokens.push({
				kind: 'word',
				text: part,
				orpIndex: calculateORP(part)
			});
		}
	}
	return tokens;
}

export function bodyToStream(body: string): StreamToken[] {
	const paragraphs = body
		.split(/\n\n+/)
		.map((p) => p.trim())
		.filter(Boolean);
	if (paragraphs.length === 0) {
		return [];
	}

	const stream: StreamToken[] = [];
	for (let i = 0; i < paragraphs.length; i++) {
		const paragraph = paragraphs[i];
		if (!paragraph) {
			continue;
		}
		if (i > 0) {
			stream.push({ kind: 'pause', pauseMs: PARAGRAPH_PAUSE_MS });
		}
		stream.push(...proseToWordTokens(paragraph));
	}
	return stream;
}
