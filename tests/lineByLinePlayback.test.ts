import { describe, it, expect } from 'vitest';
import {
	applyLineByLineRewindBuffer,
	getLegacyLineChunk,
	getManifestLineChunk,
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
	it('returns the full sentence as a legacy line chunk', () => {
		const { words, navWords } = legacyNavWords('One two. Three four.');
		const units = buildSentenceUnits(navWords);

		expect(getLegacyLineChunk(words, units, 1)).toEqual({
			words: words.slice(0, 2),
			endIndex: 2,
			lineStartIndex: 0
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

		expect(getManifestLineChunk(stream, units, 1)).toEqual({
			tokens: stream.slice(0, 2),
			endIndex: 2,
			lineStartIndex: 0
		});
	});

	it('sums per-word delay for a line instead of using max delay', () => {
		const { words, navWords } = legacyNavWords('One two.');
		const units = buildSentenceUnits(navWords);
		const { words: lineWords } = getLegacyLineChunk(words, units, 0);
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
});
