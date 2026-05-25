import type { SpeedReaderAiSettings, WordData } from '../types';
import type { StreamToken } from '../types/processedDocument';
import { getDelayForToken } from './manifestPlayback';
import type { MicropauseService } from '../services/micropauseService';
import {
	findSentenceUnitForSeekIndex,
	type SentenceUnit
} from './lineRepeatPlayback';

export const LINE_BY_LINE_REWIND_BUFFER_MULTIPLIER = 1.5;

export function getLegacyLineChunk(
	words: WordData[],
	units: SentenceUnit[],
	startIndex: number
): { words: WordData[]; endIndex: number; lineStartIndex: number } {
	if (units.length === 0 || words.length === 0) {
		return { words: [], endIndex: startIndex, lineStartIndex: startIndex };
	}

	const unitIndex = findSentenceUnitForSeekIndex(units, startIndex);
	const unit = units[unitIndex]!;
	const lineStartIndex = unit.startSeekIndex;
	const endIndex = Math.min(unit.endSeekIndex + 1, words.length);

	return {
		words: words.slice(lineStartIndex, endIndex),
		endIndex,
		lineStartIndex
	};
}

export function getManifestLineChunk(
	stream: StreamToken[],
	units: SentenceUnit[],
	startIndex: number
): { tokens: StreamToken[]; endIndex: number; lineStartIndex: number } {
	if (units.length === 0 || stream.length === 0) {
		return { tokens: [], endIndex: startIndex, lineStartIndex: startIndex };
	}

	const unitIndex = findSentenceUnitForSeekIndex(units, startIndex);
	const unit = units[unitIndex]!;
	const lineStartIndex = unit.startSeekIndex;
	const tokens: StreamToken[] = [];

	for (let i = lineStartIndex; i <= unit.endSeekIndex && i < stream.length; i++) {
		const token = stream[i];
		if (token) {
			tokens.push(token);
		}
	}

	return {
		tokens,
		endIndex: Math.min(unit.endSeekIndex + 1, stream.length),
		lineStartIndex
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
