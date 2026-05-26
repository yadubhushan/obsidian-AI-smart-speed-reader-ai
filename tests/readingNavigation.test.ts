import { describe, it, expect } from 'vitest';
import {
	computeSmartForwardTarget,
	computeSmartRewindTarget,
	isSentenceEndPunctuation,
	navWordsFromLegacy,
	navWordsFromStream,
	buildPauseContext,
	SMART_NAV_CHUNK_SIZE
} from '../src/engine/readingNavigation';
import type { WordData } from '../src/types';

function makeWords(count: number, sentenceEndAt: number[] = []): WordData[] {
	const endSet = new Set(sentenceEndAt);
	return Array.from({ length: count }, (_, i) => ({
		raw: `w${i}`,
		word: `w${i}`,
		punctuation: endSet.has(i) ? '.' : '',
		orpIndex: 0,
		start: i * 4,
		end: i * 4 + 2
	}));
}

describe('readingNavigation', () => {
	it('rewinds in 15-word chunks within a long sentence', () => {
		const navWords = navWordsFromLegacy(makeWords(35, [34]));
		expect(computeSmartRewindTarget(25, navWords)).toBe(10);
		expect(computeSmartRewindTarget(10, navWords)).toBe(0);
	});

	it('at sentence start rewinds to previous sentence end', () => {
		const navWords = navWordsFromLegacy(makeWords(40, [14, 39]));
		expect(computeSmartRewindTarget(20, navWords)).toBe(15);
		expect(computeSmartRewindTarget(15, navWords)).toBe(14);
	});

	it('forwards in 15-word chunks within a sentence', () => {
		const navWords = navWordsFromLegacy(makeWords(35, [34]));
		expect(computeSmartForwardTarget(5, navWords)).toBe(20);
		expect(computeSmartForwardTarget(25, navWords)).toBe(34);
	});

	it('at sentence end forwards to next sentence start', () => {
		const navWords = navWordsFromLegacy(makeWords(40, [14, 39]));
		expect(computeSmartForwardTarget(14, navWords)).toBe(15);
	});

	it('detects sentence ends from manifest token punctuation', () => {
		const navWords = navWordsFromStream([
			{ kind: 'word', text: 'One' },
			{ kind: 'word', text: 'story.' }
		]);
		expect(navWords).toHaveLength(2);
		expect(navWords[0]!.isSentenceEnd).toBe(false);
		expect(navWords[1]!.isSentenceEnd).toBe(true);
		expect(computeSmartRewindTarget(1, navWords)).toBe(0);
	});

	it('treats line breakers --, ;, ., ! as sentence ends but not single hyphen', () => {
		expect(isSentenceEndPunctuation('-')).toBe(false);
		expect(isSentenceEndPunctuation('--')).toBe(true);
		expect(isSentenceEndPunctuation(';')).toBe(true);
		expect(isSentenceEndPunctuation('.')).toBe(true);
		expect(isSentenceEndPunctuation('!')).toBe(true);
		expect(isSentenceEndPunctuation('?')).toBe(false);
		expect(isSentenceEndPunctuation(',')).toBe(false);
	});

	it('splits nav words on semicolon and double-hyphen line breakers', () => {
		const semi = navWordsFromStream([
			{ kind: 'word', text: 'First' },
			{ kind: 'word', text: 'clause;' },
			{ kind: 'word', text: 'Second' },
			{ kind: 'word', text: 'clause.' }
		]);
		expect(semi[1]!.isSentenceEnd).toBe(true);
		expect(semi[3]!.isSentenceEnd).toBe(true);

		const dash = navWordsFromStream([
			{ kind: 'word', text: 'Line' },
			{ kind: 'word', text: 'one-' },
			{ kind: 'word', text: 'Line' },
			{ kind: 'word', text: 'two--' },
			{ kind: 'word', text: 'Done.' }
		]);
		expect(dash[1]!.isSentenceEnd).toBe(false);
		expect(dash[3]!.isSentenceEnd).toBe(true);
		expect(dash[4]!.isSentenceEnd).toBe(true);
	});

	it('buildPauseContext marks current chunk words', () => {
		const navWords = navWordsFromLegacy(makeWords(10));
		const tokens = buildPauseContext(navWords, [4, 5], 3);
		expect(tokens.some((t) => t.isCurrent && t.text === 'w4')).toBe(true);
		expect(tokens.some((t) => t.isCurrent && t.text === 'w5')).toBe(true);
		expect(tokens.some((t) => t.isCurrent && t.text === 'w3')).toBe(false);
	});

	it('uses default chunk size of 15', () => {
		expect(SMART_NAV_CHUNK_SIZE).toBe(15);
	});
});
