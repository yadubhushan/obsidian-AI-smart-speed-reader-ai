import { describe, it, expect } from 'vitest';
import {
	buildSentenceUnits,
	computeLineByLineAdvance,
	computeLineRepeatAdvance,
	findSentenceUnitForSeekIndex,
	getLineBoundary,
	nextLineUnitIndex,
	prevLineUnitIndex
} from '../src/engine/lineRepeatPlayback';
import { navWordsFromLegacy } from '../src/engine/readingNavigation';
import type { WordData } from '../src/types';

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
	return navWordsFromLegacy(words);
}

describe('lineRepeatPlayback', () => {
	it('builds sentence units from punctuation boundaries', () => {
		const navWords = legacyNavWords('Hello world. Next sentence here!');
		const units = buildSentenceUnits(navWords);

		expect(units).toHaveLength(2);
		expect(units[0]).toMatchObject({
			lineIndex: 0,
			startWordIdx: 0,
			endWordIdx: 1,
			startSeekIndex: 0,
			endSeekIndex: 1
		});
		expect(units[1]).toMatchObject({
			lineIndex: 1,
			startWordIdx: 2,
			endWordIdx: 4,
			startSeekIndex: 2,
			endSeekIndex: 4
		});
	});

	it('treats a single-word sentence as one unit', () => {
		const navWords = legacyNavWords('Hi.');
		const units = buildSentenceUnits(navWords);

		expect(units).toHaveLength(1);
		expect(units[0]).toMatchObject({
			startSeekIndex: 0,
			endSeekIndex: 0
		});
	});

	it('includes trailing text without sentence punctuation in final unit', () => {
		const navWords = legacyNavWords('First. Second without end');
		const units = buildSentenceUnits(navWords);

		expect(units).toHaveLength(2);
		expect(units[1]!.endWordIdx).toBe(3);
	});

	it('finds sentence unit for seek index', () => {
		const navWords = legacyNavWords('One. Two three.');
		const units = buildSentenceUnits(navWords);

		expect(findSentenceUnitForSeekIndex(units, 0)).toBe(0);
		expect(findSentenceUnitForSeekIndex(units, 2)).toBe(1);
		expect(findSentenceUnitForSeekIndex(units, 99)).toBe(1);
	});

	it('returns line boundary markers at sentence edges', () => {
		const navWords = legacyNavWords('Alpha beta.');
		const units = buildSentenceUnits(navWords);

		expect(getLineBoundary(units, 0, 0)).toEqual({ isStart: true, isEnd: false });
		expect(getLineBoundary(units, 0, 1)).toEqual({ isStart: false, isEnd: true });
	});

	it('loops with extra delay when advancing past sentence end', () => {
		const navWords = legacyNavWords('One two. Three.');
		const units = buildSentenceUnits(navWords);

		expect(computeLineRepeatAdvance(units, 1, 2, 600, false)).toEqual({
			action: 'loop',
			nextSeekIndex: 0,
			extraDelayMs: 600
		});
	});

	it('advances within a sentence', () => {
		const navWords = legacyNavWords('One two. Three.');
		const units = buildSentenceUnits(navWords);

		expect(computeLineRepeatAdvance(units, 0, 1, 600, false)).toEqual({
			action: 'advance',
			nextSeekIndex: 1
		});
	});

	it('navigates next and prev line unit indices', () => {
		const navWords = legacyNavWords('A. B. C.');
		const units = buildSentenceUnits(navWords);

		expect(nextLineUnitIndex(units, 0)).toBe(1);
		expect(nextLineUnitIndex(units, 2)).toBe(2);
		expect(prevLineUnitIndex(units, 1)).toBe(0);
		expect(prevLineUnitIndex(units, 0)).toBe(0);
	});

	describe('computeLineByLineAdvance', () => {
		it('advances within a sentence', () => {
			const navWords = legacyNavWords('One two. Three.');
			const units = buildSentenceUnits(navWords);

			expect(computeLineByLineAdvance(units, 0, 1, false)).toEqual({
				action: 'advance',
				nextSeekIndex: 1
			});
		});

		it('jumps to next sentence start at sentence end without looping', () => {
			const navWords = legacyNavWords('One two. Three.');
			const units = buildSentenceUnits(navWords);

			expect(computeLineByLineAdvance(units, 1, 2, false)).toEqual({
				action: 'advance',
				nextSeekIndex: 2
			});
		});

		it('completes after the final sentence', () => {
			const navWords = legacyNavWords('One two. Three.');
			const units = buildSentenceUnits(navWords);

			expect(computeLineByLineAdvance(units, 4, 5, false)).toEqual({
				action: 'complete'
			});
		});

		it('completes at manifest stream end', () => {
			const navWords = legacyNavWords('Only one.');
			const units = buildSentenceUnits(navWords);

			expect(computeLineByLineAdvance(units, 1, 2, true, 2)).toEqual({
				action: 'complete'
			});
		});
	});
});
