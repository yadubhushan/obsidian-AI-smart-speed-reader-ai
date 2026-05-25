import { describe, it, expect } from 'vitest';
import {
	applyLineByLineRewindBuffer,
	effectiveLineChunkMax,
	getLegacyLineChunk,
	getManifestLineChunk,
	partitionSentenceIntoEqualChunks,
	partitionSentenceIntoChunks,
	sumLegacyLineDelayMs,
	sumManifestLineDelayMs,
	LINE_BY_LINE_REWIND_BUFFER_MULTIPLIER
} from '../src/engine/lineByLinePlayback';
import { buildSentenceUnits } from '../src/engine/lineRepeatPlayback';
import { navWordsFromLegacy } from '../src/engine/readingNavigation';
import { MicropauseService } from '../src/services/micropauseService';
import { DEFAULT_SETTINGS, type WordData } from '../src/types';
import type { StreamToken } from '../src/types/processedDocument';

function legacyNavWords(text: string) {
	const tokens = text.split(/\s+/).filter(Boolean);
	const words: WordData[] = tokens.map((raw, index) => {
		const match = raw.match(/^(.+?)([.,!?;:)}\]"']+)$/);
		const word = match?.[1] ?? raw;
		const punctuation = match?.[2] ?? '';
		return {
			raw,
			word,
			punctuation,
			orpIndex: 0,
			start: index,
			end: index + raw.length
		};
	});
	return { words, navWords: navWordsFromLegacy(words) };
}

describe('lineByLinePlayback', () => {
	it('uses chunkSize directly as the effective line chunk max', () => {
		expect(effectiveLineChunkMax(1)).toBe(1);
		expect(effectiveLineChunkMax(15)).toBe(15);
	});

	it('returns the full sentence as a legacy line chunk', () => {
		const { words, navWords } = legacyNavWords('One two. Three four.');
		const units = buildSentenceUnits(navWords);

		expect(getLegacyLineChunk(words, units, 1, 10)).toEqual({
			words: words.slice(0, 2),
			endIndex: 2,
			lineStartIndex: 0,
			lineEndSeekIndex: 1
		});
	});

	it('returns the full sentence as a manifest line chunk', () => {
		const { navWords } = legacyNavWords('One two. Three.');
		const units = buildSentenceUnits(navWords);
		const stream: StreamToken[] = [
			{ kind: 'word', text: 'One' },
			{ kind: 'word', text: 'two.' },
			{ kind: 'word', text: 'Three.' }
		];

		expect(getManifestLineChunk(stream, units, 1, 10)).toEqual({
			tokens: stream.slice(0, 2),
			endIndex: 2,
			lineStartIndex: 0,
			lineEndSeekIndex: 1
		});
	});

	it('sums per-word delay for a line instead of using max delay', () => {
		const { words, navWords } = legacyNavWords('One two.');
		const units = buildSentenceUnits(navWords);
		const { words: lineWords } = getLegacyLineChunk(words, units, 0, 10);
		const settings = {
			...DEFAULT_SETTINGS,
			reader: {
				...DEFAULT_SETTINGS.reader,
				wpm: 600,
				enableMicropause: false
			}
		};
		const micropause = new MicropauseService(settings);

		expect(sumLegacyLineDelayMs(lineWords, settings, micropause)).toBe(200);
	});

	it('applies rewind buffer multiplier once', () => {
		expect(applyLineByLineRewindBuffer(1000, true)).toBe(
			1000 * LINE_BY_LINE_REWIND_BUFFER_MULTIPLIER
		);
		expect(applyLineByLineRewindBuffer(1000, false)).toBe(1000);
	});

	it('sums manifest token delays for a line', () => {
		const stream: StreamToken[] = [
			{ kind: 'word', text: 'One' },
			{ kind: 'word', text: 'two.' }
		];
		const settings = {
			...DEFAULT_SETTINGS,
			reader: {
				...DEFAULT_SETTINGS.reader,
				wpm: 600,
				enableMicropause: false
			}
		};
		const micropause = new MicropauseService(settings);

		expect(sumManifestLineDelayMs(stream, settings, micropause)).toBe(200);
	});

	it('splits a 15-word sentence into equal 8+7 chunks', () => {
		const wordSeekIndices = Array.from({ length: 15 }, (_, i) => i);
		expect(partitionSentenceIntoEqualChunks(wordSeekIndices, 10)).toEqual([0, 8]);
	});

	it('splits a 20-word sentence into equal 10+10 chunks', () => {
		const wordSeekIndices = Array.from({ length: 20 }, (_, i) => i);
		expect(partitionSentenceIntoEqualChunks(wordSeekIndices, 10)).toEqual([0, 10]);
	});

	it('splits a 30-word sentence into equal 10+10+10 chunks', () => {
		const wordSeekIndices = Array.from({ length: 30 }, (_, i) => i);
		expect(partitionSentenceIntoEqualChunks(wordSeekIndices, 10)).toEqual([0, 10, 20]);
	});

	it('keeps short sentences in a single chunk', () => {
		const wordSeekIndices = Array.from({ length: 8 }, (_, i) => i);
		expect(partitionSentenceIntoEqualChunks(wordSeekIndices, 10)).toEqual([0]);
	});

	it('maps legacy partition helper to equal chunks', () => {
		const texts = Array.from({ length: 20 }, (_, i) => `word${i + 1}`);
		const puncts = texts.map(() => '');

		expect(partitionSentenceIntoChunks(texts, puncts, 0, 19, 10)).toEqual([0, 10]);
	});

	it('returns the correct sub-chunk for a mid-sentence seek index', () => {
		const wordsText = Array.from({ length: 20 }, (_, i) => `word${i + 1}`).join(' ') + '.';
		const { words, navWords } = legacyNavWords(wordsText);
		const units = buildSentenceUnits(navWords);

		expect(getLegacyLineChunk(words, units, 16, 10)).toEqual({
			words: words.slice(10, 20),
			endIndex: 20,
			lineStartIndex: 10,
			lineEndSeekIndex: 19
		});
		expect(getLegacyLineChunk(words, units, 16, 10).words.length).toBe(10);
	});
});
