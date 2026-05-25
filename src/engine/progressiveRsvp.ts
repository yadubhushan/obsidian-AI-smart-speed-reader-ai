import type { WordData } from '../types';
import type { StreamToken } from '../types/processedDocument';
import { calculateORP } from '../services/textParser';
import { primaryDisplayToken, tokensToDisplayChunk } from './manifestPlayback';

export function wordLetterCount(text: string): number {
	return text.length;
}

export function isShortWord(text: string, maxWordLength: number): boolean {
	return wordLetterCount(text) <= maxWordLength;
}

export function getProgressiveLegacyChunk(
	words: WordData[],
	startIndex: number,
	maxWordLength: number
): { words: WordData[]; endIndex: number } {
	if (startIndex >= words.length) {
		return { words: [], endIndex: startIndex };
	}

	const first = words[startIndex]!;
	if (!isShortWord(first.word, maxWordLength)) {
		return { words: [first], endIndex: startIndex + 1 };
	}

	const bundle: WordData[] = [first];
	let index = startIndex + 1;

	while (index < words.length) {
		const next = words[index]!;
		if (!isShortWord(next.word, maxWordLength)) {
			break;
		}
		bundle.push(next);
		index++;
	}

	return { words: bundle, endIndex: index };
}

export function getProgressiveWordTokensChunk(
	stream: StreamToken[],
	startIndex: number,
	maxWordLength: number
): { tokens: StreamToken[]; endIndex: number } {
	const tokens: StreamToken[] = [];
	let index = startIndex;

	while (index < stream.length) {
		const token = stream[index];
		if (!token) {
			break;
		}

		if (token.kind !== 'word' || !token.text) {
			if (tokens.length === 0) {
				tokens.push(token);
				index++;
			}
			break;
		}

		const short = isShortWord(token.text, maxWordLength);
		if (!short) {
			if (tokens.length > 0) {
				break;
			}
			tokens.push(token);
			index++;
			break;
		}

		tokens.push(token);
		index++;
	}

	return { tokens, endIndex: index };
}

export function progressiveWordsToDisplayChunk(words: WordData[]): WordData[] {
	if (words.length === 0) {
		return [];
	}
	if (words.length === 1) {
		return words;
	}

	const combined = words.map((word) => word.word).join(' ');
	const last = words[words.length - 1]!;

	return [
		{
			raw: words.map((word) => word.raw).join(' '),
			word: combined,
			punctuation: last.punctuation,
			orpIndex: calculateORP(combined),
			start: words[0]!.start,
			end: last.end
		}
	];
}

export function progressiveTokensToDisplayChunk(tokens: StreamToken[]): WordData[] {
	const wordTokens = tokens.filter((token) => token.kind === 'word' && token.text);
	if (wordTokens.length <= 1) {
		return tokensToDisplayChunk(tokens);
	}

	const combined = wordTokens.map((token) => token.text ?? '').join(' ');
	return [
		{
			raw: combined,
			word: combined,
			punctuation: '',
			orpIndex: calculateORP(combined),
			start: 0,
			end: combined.length
		}
	];
}

export function progressivePrimaryDisplayToken(
	tokens: StreamToken[]
): { kind: 'word'; text: string; orpIndex: number } | ReturnType<typeof primaryDisplayToken> {
	const wordTokens = tokens.filter((token) => token.kind === 'word' && token.text);
	if (wordTokens.length <= 1) {
		return primaryDisplayToken(tokens);
	}

	const combined = wordTokens.map((token) => token.text ?? '').join(' ');
	return {
		kind: 'word',
		text: combined,
		orpIndex: calculateORP(combined)
	};
}

export function collectProgressiveLegacyBundleTexts(
	words: WordData[],
	maxWordLength: number
): string[] {
	const bundles: string[] = [];
	let index = 0;

	while (index < words.length) {
		const { words: chunk, endIndex } = getProgressiveLegacyChunk(words, index, maxWordLength);
		if (chunk.length === 0) {
			break;
		}
		const last = chunk[chunk.length - 1]!;
		bundles.push(`${chunk.map((word) => word.word).join(' ')}${last.punctuation}`);
		index = endIndex;
	}

	return bundles;
}
