import type { SpeedReaderAiSettings, WordData } from '../types';
import type { StreamToken } from '../types/processedDocument';
import { getDelayForToken } from './manifestPlayback';
import type { MicropauseService } from '../services/micropauseService';
import {
	findSentenceUnitForSeekIndex,
	type SentenceUnit
} from './lineRepeatPlayback';

export const LINE_BY_LINE_REWIND_BUFFER_MULTIPLIER = 1.5;

/** Show the full sentence in one step when word count is at or below this limit. */
export const LINE_BY_LINE_FULL_LINE_WORD_LIMIT = 12;

/** Max words per sub-chunk when a sentence exceeds LINE_BY_LINE_FULL_LINE_WORD_LIMIT. */
export const LINE_BY_LINE_MAX_CHUNK_WORDS = 10;

export interface LineChunkBounds {
	chunkStarts: number[];
	chunkIndex: number;
	lineStartIndex: number;
	endIndex: number;
}

export function partitionLineWordSeekIndices(wordSeekIndices: number[]): number[] {
	if (wordSeekIndices.length <= LINE_BY_LINE_FULL_LINE_WORD_LIMIT) {
		return wordSeekIndices.length > 0 ? [wordSeekIndices[0]!] : [];
	}
	return partitionSentenceIntoEqualChunks(wordSeekIndices, LINE_BY_LINE_MAX_CHUNK_WORDS);
}

export function partitionSentenceIntoEqualChunks(
	wordSeekIndices: number[],
	maxWords: number
): number[] {
	if (wordSeekIndices.length === 0) {
		return [];
	}

	if (wordSeekIndices.length <= maxWords) {
		return [wordSeekIndices[0]!];
	}

	const wordCount = wordSeekIndices.length;
	const numChunks = Math.ceil(wordCount / maxWords);
	const baseSize = Math.floor(wordCount / numChunks);
	const remainder = wordCount % numChunks;

	const chunks: number[] = [];
	let offset = 0;

	for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
		const size = baseSize + (chunkIndex < remainder ? 1 : 0);
		chunks.push(wordSeekIndices[offset]!);
		offset += size;
	}

	return chunks;
}

/** @deprecated Use partitionSentenceIntoEqualChunks */
export function partitionSentenceIntoChunks(
	tokenTexts: string[],
	_tokenPunctuation: string[],
	startSeekIndex: number,
	endSeekIndex: number,
	maxWords: number = 1
): number[] {
	const wordSeekIndices: number[] = [];
	for (let i = startSeekIndex; i <= endSeekIndex; i++) {
		const text = tokenTexts[i - startSeekIndex];
		if (text && text.trim().length > 0) {
			wordSeekIndices.push(i);
		}
	}
	return partitionSentenceIntoEqualChunks(wordSeekIndices, maxWords);
}

export function findChunkIndex(chunkStarts: number[], seekIndex: number): number {
	let chunkIndex = chunkStarts.findIndex((start) => start > seekIndex) - 1;
	if (chunkIndex < 0) {
		chunkIndex =
			chunkStarts.length > 0 && seekIndex >= chunkStarts[chunkStarts.length - 1]!
				? chunkStarts.length - 1
				: 0;
	}
	return chunkIndex;
}

export function resolveLineChunkBounds(
	chunkStarts: number[],
	seekIndex: number,
	unitEndSeekIndex: number,
	maxIndex: number
): LineChunkBounds {
	const chunkIndex = findChunkIndex(chunkStarts, seekIndex);
	const lineStartIndex = chunkStarts[chunkIndex]!;
	const nextChunkStart =
		chunkIndex + 1 < chunkStarts.length ? chunkStarts[chunkIndex + 1]! : unitEndSeekIndex + 1;
	const endIndex = Math.min(nextChunkStart, maxIndex);

	return { chunkStarts, chunkIndex, lineStartIndex, endIndex };
}

export function getLegacyUnitWordSeekIndices(unit: SentenceUnit): number[] {
	const indices: number[] = [];
	for (let i = unit.startSeekIndex; i <= unit.endSeekIndex; i++) {
		indices.push(i);
	}
	return indices;
}

export function getManifestUnitWordSeekIndices(stream: StreamToken[], unit: SentenceUnit): number[] {
	const indices: number[] = [];
	for (let i = unit.startSeekIndex; i <= unit.endSeekIndex && i < stream.length; i++) {
		const token = stream[i];
		if (token?.kind === 'word' && token.text?.trim()) {
			indices.push(i);
		}
	}
	return indices;
}

export function getLineChunkStartsForUnit(unit: SentenceUnit, wordSeekIndices: number[]): number[] {
	const indices =
		wordSeekIndices.length > 0 ? wordSeekIndices : getLegacyUnitWordSeekIndices(unit);
	return partitionLineWordSeekIndices(indices);
}

function legacyWordSeekIndices(unit: SentenceUnit): number[] {
	return getLegacyUnitWordSeekIndices(unit);
}

function manifestWordSeekIndices(stream: StreamToken[], unit: SentenceUnit): number[] {
	return getManifestUnitWordSeekIndices(stream, unit);
}

function chunkStartsForUnit(wordSeekIndices: number[]): number[] {
	return partitionLineWordSeekIndices(wordSeekIndices);
}

export function legacyUnitTextsAndPunctuation(
	words: WordData[],
	unit: SentenceUnit
): { texts: string[]; puncts: string[] } {
	const slice = words.slice(unit.startSeekIndex, unit.endSeekIndex + 1);
	return {
		texts: slice.map((w) => w.word),
		puncts: slice.map((w) => w.punctuation)
	};
}

export function manifestUnitTextsAndPunctuation(
	stream: StreamToken[],
	unit: SentenceUnit
): { texts: string[]; puncts: string[] } {
	const texts: string[] = [];
	const puncts: string[] = [];

	for (let i = unit.startSeekIndex; i <= unit.endSeekIndex && i < stream.length; i++) {
		const token = stream[i];
		const text = token?.kind === 'word' ? token.text || '' : '';
		texts.push(text);
		puncts.push('');
	}

	return { texts, puncts };
}

export function getLegacyLineChunk(
	words: WordData[],
	units: SentenceUnit[],
	startIndex: number
): { words: WordData[]; endIndex: number; lineStartIndex: number; lineEndSeekIndex: number } {
	if (units.length === 0 || words.length === 0) {
		return { words: [], endIndex: startIndex, lineStartIndex: startIndex, lineEndSeekIndex: startIndex };
	}

	const unitIndex = findSentenceUnitForSeekIndex(units, startIndex);
	const unit = units[unitIndex]!;
	const wordSeekIndices = legacyWordSeekIndices(unit);
	const chunkStarts = chunkStartsForUnit(wordSeekIndices);
	const { lineStartIndex, endIndex } = resolveLineChunkBounds(
		chunkStarts,
		startIndex,
		unit.endSeekIndex,
		words.length
	);

	return {
		words: words.slice(lineStartIndex, endIndex),
		endIndex,
		lineStartIndex,
		lineEndSeekIndex: endIndex > lineStartIndex ? endIndex - 1 : lineStartIndex
	};
}

export function getManifestLineChunk(
	stream: StreamToken[],
	units: SentenceUnit[],
	startIndex: number
): { tokens: StreamToken[]; endIndex: number; lineStartIndex: number; lineEndSeekIndex: number } {
	if (units.length === 0 || stream.length === 0) {
		return { tokens: [], endIndex: startIndex, lineStartIndex: startIndex, lineEndSeekIndex: startIndex };
	}

	const unitIndex = findSentenceUnitForSeekIndex(units, startIndex);
	const unit = units[unitIndex]!;
	const wordSeekIndices = manifestWordSeekIndices(stream, unit);
	const chunkStarts = chunkStartsForUnit(wordSeekIndices);
	const { lineStartIndex, endIndex } = resolveLineChunkBounds(
		chunkStarts,
		startIndex,
		unit.endSeekIndex,
		stream.length
	);

	const tokens: StreamToken[] = [];
	let lineEndSeekIndex = lineStartIndex;
	for (let i = lineStartIndex; i < endIndex; i++) {
		const token = stream[i];
		if (token) {
			tokens.push(token);
			if (token.kind === 'word' && token.text?.trim()) {
				lineEndSeekIndex = i;
			}
		}
	}

	return {
		tokens,
		endIndex,
		lineStartIndex,
		lineEndSeekIndex
	};
}

export function sumLegacyLineDelayMs(
	words: WordData[],
	settings: SpeedReaderAiSettings,
	micropauseService: MicropauseService
): number {
	if (words.length === 0) {
		return 0;
	}

	const baseDelay = 60000 / settings.reader.wpm;
	let total = 0;

	for (const word of words) {
		total += baseDelay * micropauseService.getWordMultiplier(word);
	}

	return total;
}

export function sumManifestLineDelayMs(
	tokens: StreamToken[],
	settings: SpeedReaderAiSettings,
	micropauseService: MicropauseService
): number {
	let total = 0;

	for (const token of tokens) {
		total += getDelayForToken(token, settings, micropauseService);
	}

	return total;
}

export function applyLineByLineRewindBuffer(delayMs: number, rewindBufferActive: boolean): number {
	if (!rewindBufferActive || delayMs <= 0) {
		return delayMs;
	}
	return delayMs * LINE_BY_LINE_REWIND_BUFFER_MULTIPLIER;
}
