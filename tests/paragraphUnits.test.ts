import { describe, expect, it } from 'vitest';
import {
	buildParagraphUnits,
	findParagraphForWordIndex,
	hasParagraphMarkers,
	paragraphTextFromUnit
} from '../src/engine/paragraphUnits';
import { buildSentenceUnits } from '../src/engine/lineRepeatPlayback';
import type { NavWord } from '../src/engine/readingNavigation';

function nav(words: string[], paragraphStarts: number[] = [0]): NavWord[] {
	const startSet = new Set(paragraphStarts);
	return words.map((display, wordIndex) => ({
		wordIndex,
		seekIndex: wordIndex,
		display,
		isSentenceEnd: /[.!?]$/.test(display),
		isParagraphStart: startSet.has(wordIndex)
	}));
}

describe('paragraphUnits', () => {
	it('groups by paragraph start markers', () => {
		const navWords = nav(['One.', 'Two.', 'Three.', 'Four.'], [0, 2]);
		const units = buildParagraphUnits(navWords, buildSentenceUnits(navWords));
		expect(units).toEqual([
			{ startWordIdx: 0, endWordIdx: 1 },
			{ startWordIdx: 2, endWordIdx: 3 }
		]);
		expect(hasParagraphMarkers(navWords)).toBe(true);
	});

	it('finds paragraph for word index', () => {
		const navWords = nav(['A.', 'B.', 'C.', 'D.'], [0, 2]);
		const units = buildParagraphUnits(navWords, buildSentenceUnits(navWords));
		expect(findParagraphForWordIndex(units, 1)?.startWordIdx).toBe(0);
		expect(findParagraphForWordIndex(units, 3)?.startWordIdx).toBe(2);
	});

	it('fallback caps at six sentences', () => {
		const words = Array.from({ length: 10 }, (_, i) => `Word${i}.`);
		const navWords = nav(words);
		const sentenceUnits = buildSentenceUnits(navWords);
		const units = buildParagraphUnits(navWords, sentenceUnits);
		expect(units.length).toBeGreaterThan(1);
		expect(units[0]!.endWordIdx - units[0]!.startWordIdx + 1).toBeLessThanOrEqual(6);
	});

	it('paragraphTextFromUnit joins display text', () => {
		const navWords = nav(['Hello.', 'World.'], [0]);
		const units = buildParagraphUnits(navWords, buildSentenceUnits(navWords));
		expect(paragraphTextFromUnit(navWords, units[0]!)).toBe('Hello. World.');
	});
});
