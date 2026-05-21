import type { SpeedReaderAiSettings, WordData } from '../types';
import type { StreamToken, StreamTokenKind } from '../types/processedDocument';
import { calculateORP } from '../services/textParser';
import { MicropauseService } from '../services/micropauseService';

export const DEFAULT_PAUSE_MS = 400;
export const SECTION_BREAK_PAUSE_MS = 800;
export const IMAGE_MIN_PAUSE_MS = 1500;

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function streamTokenToWordData(token: StreamToken, index: number): WordData | null {
	if (token.kind !== 'word' || !token.text) {
		return null;
	}

	const word = token.text;
	const orpIndex = token.orpIndex ?? calculateORP(word);

	return {
		raw: word,
		word,
		punctuation: '',
		orpIndex,
		start: index,
		end: index + word.length
	};
}

export function tokenDisplayLabel(token: StreamToken): string {
	switch (token.kind) {
		case 'word':
			return token.text ?? '';
		case 'pause':
			return '·';
		case 'image':
			return `[Image: ${token.alt?.trim() || 'Image'}]`;
		case 'section_break':
			return token.text?.trim() || '—';
		default:
			return '';
	}
}

export function countWordTokensInStream(stream: StreamToken[]): number {
	return stream.filter((t) => t.kind === 'word').length;
}

export function getWordTokensChunk(
	stream: StreamToken[],
	startIndex: number,
	chunkSize: number
): { tokens: StreamToken[]; endIndex: number } {
	const tokens: StreamToken[] = [];
	let index = startIndex;

	while (index < stream.length && tokens.length < chunkSize) {
		const token = stream[index];
		if (!token) {
			break;
		}
		if (token.kind === 'word') {
			tokens.push(token);
		} else {
			if (tokens.length === 0) {
				tokens.push(token);
				index++;
			}
			break;
		}
		index++;
	}

	return { tokens, endIndex: index };
}

export function getDelayForTokens(
	tokens: StreamToken[],
	settings: SpeedReaderAiSettings,
	micropauseService: MicropauseService
): number {
	if (tokens.length === 0) {
		return 0;
	}

	const baseDelay = 60000 / settings.reader.wpm;
	let maxDelay = 0;

	for (const token of tokens) {
		const delay = getDelayForToken(token, settings, micropauseService);
		maxDelay = Math.max(maxDelay, delay);
	}

	return maxDelay > 0 ? maxDelay : baseDelay;
}

export function getDelayForToken(
	token: StreamToken,
	settings: SpeedReaderAiSettings,
	micropauseService: MicropauseService
): number {
	const baseDelay = 60000 / settings.reader.wpm;

	switch (token.kind) {
		case 'word': {
			const wordData = streamTokenToWordData(token, 0);
			if (!wordData) {
				return baseDelay;
			}
			return baseDelay * micropauseService.getWordMultiplier(wordData);
		}
		case 'pause':
			return token.pauseMs ?? DEFAULT_PAUSE_MS;
		case 'image':
			return Math.max(baseDelay, IMAGE_MIN_PAUSE_MS);
		case 'section_break':
			return SECTION_BREAK_PAUSE_MS;
		default:
			return baseDelay;
	}
}

export function tokensToDisplayChunk(tokens: StreamToken[]): WordData[] {
	const chunk: WordData[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) {
			continue;
		}
		if (token.kind === 'word') {
			const wordData = streamTokenToWordData(token, i);
			if (wordData) {
				chunk.push(wordData);
			}
		} else {
			const label = tokenDisplayLabel(token);
			chunk.push({
				raw: label,
				word: label,
				punctuation: '',
				orpIndex: Math.min(1, Math.max(0, label.length - 1)),
				start: i,
				end: i + label.length
			});
		}
	}
	return chunk;
}

export function primaryDisplayToken(
	tokens: StreamToken[]
): { kind: StreamTokenKind; text?: string; orpIndex?: number; alt?: string } | undefined {
	const first = tokens[0];
	if (!first) {
		return undefined;
	}

	return {
		kind: first.kind,
		text: first.kind === 'word' ? first.text : tokenDisplayLabel(first),
		orpIndex: first.orpIndex,
		alt: first.alt
	};
}

export function findHeadingTokenIndex(stream: StreamToken[], titleOrId: string): number {
	const needle = titleOrId.trim().toLowerCase();
	if (!needle) {
		return 0;
	}

	for (let i = 0; i < stream.length; i++) {
		const token = stream[i];
		if (token?.kind === 'section_break' && token.text?.trim().toLowerCase() === needle) {
			return i;
		}
	}

	for (let i = 0; i < stream.length; i++) {
		const token = stream[i];
		if (token?.kind === 'word' && token.text?.trim().toLowerCase() === needle) {
			return i;
		}
	}

	return 0;
}

export function listStreamHeadings(
	stream: StreamToken[]
): Array<{ title: string; tokenIndex: number }> {
	const headings: Array<{ title: string; tokenIndex: number }> = [];
	for (let i = 0; i < stream.length; i++) {
		const token = stream[i];
		if (token?.kind === 'section_break' && token.text?.trim()) {
			headings.push({ title: token.text.trim(), tokenIndex: i });
		}
	}
	return headings;
}
