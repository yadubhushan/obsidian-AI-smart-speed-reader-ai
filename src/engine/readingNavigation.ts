import type { WordData } from '../types';
import type { StreamToken } from '../types/processedDocument';

export const SMART_NAV_CHUNK_SIZE = 15;
export const PAUSE_CONTEXT_RADIUS = 15;

const TRAILING_PUNCT_RE = /^(.+?)([.,!?;:)}\]"']+)$/;
const SENTENCE_END_RE = /[.!?]/;

export interface NavWord {
	wordIndex: number;
	/** Legacy: word index; manifest: stream token index. */
	seekIndex: number;
	display: string;
	isSentenceEnd: boolean;
}

export interface PauseContextToken {
	text: string;
	isCurrent: boolean;
}

export function wordDisplayText(word: string, punctuation: string): string {
	return `${word}${punctuation}`;
}

export function parseTrailingPunctuation(raw: string): { word: string; punctuation: string } {
	const match = raw.match(TRAILING_PUNCT_RE);
	if (match?.[1] && match[2]) {
		return { word: match[1], punctuation: match[2] };
	}
	return { word: raw, punctuation: '' };
}

export function isSentenceEndPunctuation(punctuation: string): boolean {
	return SENTENCE_END_RE.test(punctuation);
}

export function navWordsFromLegacy(words: WordData[]): NavWord[] {
	return words.map((w, wordIndex) => ({
		wordIndex,
		seekIndex: wordIndex,
		display: wordDisplayText(w.word, w.punctuation),
		isSentenceEnd: isSentenceEndPunctuation(w.punctuation)
	}));
}

export function navWordsFromStream(stream: StreamToken[]): NavWord[] {
	const result: NavWord[] = [];
	let wordIndex = 0;

	for (let tokenIndex = 0; tokenIndex < stream.length; tokenIndex++) {
		const token = stream[tokenIndex];
		if (token?.kind !== 'word' || !token.text) {
			continue;
		}

		const { punctuation } = parseTrailingPunctuation(token.text);
		result.push({
			wordIndex,
			seekIndex: tokenIndex,
			display: token.text,
			isSentenceEnd: isSentenceEndPunctuation(punctuation)
		});
		wordIndex++;
	}

	return result;
}

export function findSentenceStart(navWords: NavWord[], currentWordIdx: number): number {
	if (navWords.length === 0) {
		return 0;
	}

	const w = Math.max(0, Math.min(currentWordIdx, navWords.length - 1));
	for (let i = w - 1; i >= 0; i--) {
		if (navWords[i]!.isSentenceEnd) {
			return i + 1;
		}
	}
	return 0;
}

export function findSentenceEnd(navWords: NavWord[], currentWordIdx: number): number {
	if (navWords.length === 0) {
		return 0;
	}

	const w = Math.max(0, Math.min(currentWordIdx, navWords.length - 1));
	const last = navWords.length - 1;
	for (let i = w; i <= last; i++) {
		if (navWords[i]!.isSentenceEnd) {
			return i;
		}
	}
	return last;
}

export function findPreviousSentenceEnd(navWords: NavWord[], currentWordIdx: number): number {
	if (navWords.length === 0 || currentWordIdx <= 0) {
		return 0;
	}

	const w = Math.max(0, Math.min(currentWordIdx, navWords.length - 1));
	for (let i = w - 1; i >= 0; i--) {
		if (navWords[i]!.isSentenceEnd) {
			return i;
		}
	}
	return 0;
}

export function findNextSentenceStart(navWords: NavWord[], currentWordIdx: number): number {
	if (navWords.length === 0) {
		return 0;
	}

	const w = Math.max(0, Math.min(currentWordIdx, navWords.length - 1));
	const last = navWords.length - 1;
	for (let i = w; i < last; i++) {
		if (navWords[i]!.isSentenceEnd) {
			return i + 1;
		}
	}
	return last;
}

export function computeSmartRewindTarget(
	currentWordIdx: number,
	navWords: NavWord[],
	chunkSize = SMART_NAV_CHUNK_SIZE
): number {
	if (navWords.length === 0) {
		return 0;
	}

	const w = Math.max(0, Math.min(currentWordIdx, navWords.length - 1));
	const sentenceStart = findSentenceStart(navWords, w);

	if (w - chunkSize >= sentenceStart) {
		return w - chunkSize;
	}
	if (w > sentenceStart) {
		return sentenceStart;
	}
	return findPreviousSentenceEnd(navWords, w);
}

export function computeSmartForwardTarget(
	currentWordIdx: number,
	navWords: NavWord[],
	chunkSize = SMART_NAV_CHUNK_SIZE
): number {
	if (navWords.length === 0) {
		return 0;
	}

	const w = Math.max(0, Math.min(currentWordIdx, navWords.length - 1));
	const sentenceEnd = findSentenceEnd(navWords, w);

	if (w + chunkSize <= sentenceEnd) {
		return w + chunkSize;
	}
	if (w < sentenceEnd) {
		return sentenceEnd;
	}
	return findNextSentenceStart(navWords, w);
}

/** Map a manifest stream token index to the word index in `navWords`. */
export function wordIndexForSeekIndex(navWords: NavWord[], seekIndex: number): number {
	if (navWords.length === 0) {
		return 0;
	}

	let result = 0;
	for (const nw of navWords) {
		if (nw.seekIndex <= seekIndex) {
			result = nw.wordIndex;
		} else {
			break;
		}
	}
	return result;
}

export function wordIndicesForLegacyChunk(currentIndex: number, chunkSize: number, totalWords: number): number[] {
	const end = Math.min(currentIndex + chunkSize, totalWords);
	const indices: number[] = [];
	for (let i = currentIndex; i < end; i++) {
		indices.push(i);
	}
	return indices.length > 0 ? indices : [Math.min(currentIndex, Math.max(totalWords - 1, 0))];
}

export function wordIndicesForManifestChunk(
	navWords: NavWord[],
	startTokenIndex: number,
	chunkSize: number,
	streamLength: number
): number[] {
	const indices: number[] = [];
	let collected = 0;

	for (const nw of navWords) {
		if (nw.seekIndex < startTokenIndex) {
			continue;
		}
		if (collected >= chunkSize) {
			break;
		}
		if (nw.seekIndex >= streamLength) {
			break;
		}
		indices.push(nw.wordIndex);
		collected++;
	}

	if (indices.length > 0) {
		return indices;
	}

	return [wordIndexForSeekIndex(navWords, startTokenIndex)];
}

export function buildPauseContext(
	navWords: NavWord[],
	currentWordIndices: number[],
	radius = PAUSE_CONTEXT_RADIUS
): PauseContextToken[] {
	if (navWords.length === 0) {
		return [];
	}

	const currentSet = new Set(currentWordIndices);
	const anchor = currentWordIndices.length > 0 ? Math.min(...currentWordIndices) : 0;
	const rangeStart = Math.max(0, anchor - radius);
	const rangeEnd = Math.min(navWords.length - 1, anchor + radius);

	const tokens: PauseContextToken[] = [];
	for (let i = rangeStart; i <= rangeEnd; i++) {
		tokens.push({
			text: navWords[i]!.display,
			isCurrent: currentSet.has(i)
		});
	}
	return tokens;
}
