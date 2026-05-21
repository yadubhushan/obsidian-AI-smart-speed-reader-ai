import { describe, expect, it } from 'vitest';
import {
	extractLookupWordFromReaderState,
	normalizeWordForLookup,
	parseFreeDictionaryResponse
} from '../src/dictionary/dictionaryLookup';
import type { ReaderState } from '../src/types';

describe('normalizeWordForLookup', () => {
	it('lowercases and accepts plain words', () => {
		expect(normalizeWordForLookup('Dorian')).toBe('dorian');
		expect(normalizeWordForLookup('HELLO')).toBe('hello');
	});

	it('strips possessive suffix', () => {
		expect(normalizeWordForLookup("dorian's")).toBe('dorian');
	});

	it('accepts hyphenated words', () => {
		expect(normalizeWordForLookup('well-known')).toBe('well-known');
	});

	it('rejects numbers and empty tokens', () => {
		expect(normalizeWordForLookup('123')).toBeNull();
		expect(normalizeWordForLookup('')).toBeNull();
		expect(normalizeWordForLookup('---')).toBeNull();
	});
});

describe('extractLookupWordFromReaderState', () => {
	it('returns first chunk word', () => {
		const state = {
			chunk: [{ word: 'Ephemeral', raw: 'Ephemeral', punctuation: '', orpIndex: 1, start: 0, end: 9 }],
			finished: false
		} as ReaderState;
		expect(extractLookupWordFromReaderState(state)).toBe('Ephemeral');
	});

	it('returns null for non-word display tokens', () => {
		const state = {
			chunk: [],
			finished: false,
			displayToken: { kind: 'section_break', text: '---' }
		} as ReaderState;
		expect(extractLookupWordFromReaderState(state)).toBeNull();
	});
});

describe('parseFreeDictionaryResponse', () => {
	it('parses meanings and limits output shape', () => {
		const json = JSON.stringify([
			{
				word: 'hello',
				phonetic: '/həˈloʊ/',
				meanings: [
					{
						partOfSpeech: 'noun',
						definitions: [
							{ definition: 'A greeting.', example: 'Hello there.' },
							{ definition: 'Second noun sense.' }
						]
					},
					{
						partOfSpeech: 'verb',
						definitions: [{ definition: 'To greet someone.' }]
					},
					{
						partOfSpeech: 'interjection',
						definitions: [{ definition: 'Extra meaning.' }]
					}
				]
			}
		]);

		const result = parseFreeDictionaryResponse(json);
		expect(result).not.toBeNull();
		expect(result?.word).toBe('hello');
		expect(result?.phonetic).toBe('/həˈloʊ/');
		expect(result?.meanings).toHaveLength(2);
		expect(result?.meanings[0]?.definitions).toHaveLength(2);
		expect(result?.meanings[0]?.definitions[0]?.example).toBe('Hello there.');
	});

	it('returns null for empty arrays', () => {
		expect(parseFreeDictionaryResponse('[]')).toBeNull();
	});

	it('parses admires verb conjugation from API shape', () => {
		const json = JSON.stringify([
			{
				word: 'admires',
				phonetics: [],
				meanings: [
					{
						partOfSpeech: 'verb',
						definitions: [
							{
								definition:
									'To be amazed at; to view with surprise; to marvel at.',
								synonyms: [],
								antonyms: []
							},
							{
								definition: 'To regard with wonder and delight.',
								synonyms: [],
								antonyms: []
							}
						],
						synonyms: [],
						antonyms: []
					}
				]
			}
		]);

		const result = parseFreeDictionaryResponse(json);
		expect(result).not.toBeNull();
		expect(result?.word).toBe('admires');
		expect(result?.meanings[0]?.partOfSpeech).toBe('verb');
		expect(result?.meanings[0]?.definitions[0]?.text).toContain('amazed');
		expect(result?.meanings[0]?.definitions).toHaveLength(2);
	});
});
