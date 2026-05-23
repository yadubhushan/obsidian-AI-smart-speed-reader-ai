import { describe, expect, it } from 'vitest';
import {
	extractLookupWordFromReaderState,
	normalizeWordForLookup
} from '../src/dictionary/dictionaryLookup';
import { parseDictionaryApiDevResponse } from '../src/dictionary/providers/dictionaryApiDevProvider';
import { parseFreeDictionaryApiResponse } from '../src/dictionary/providers/freeDictionaryApiProvider';
import {
	MERRIAM_WEBSTER_ATTRIBUTION,
	parseMerriamWebsterResponse,
	stripMerriamWebsterTokens
} from '../src/dictionary/providers/merriamWebsterProvider';
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

describe('parseDictionaryApiDevResponse', () => {
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

		const result = parseDictionaryApiDevResponse(json);
		expect(result).not.toBeNull();
		expect(result?.word).toBe('hello');
		expect(result?.phonetic).toBe('/həˈloʊ/');
		expect(result?.meanings).toHaveLength(2);
		expect(result?.meanings[0]?.definitions).toHaveLength(2);
		expect(result?.meanings[0]?.definitions[0]?.example).toBe('Hello there.');
		expect(result?.attribution.label).toBe('dictionaryapi.dev');
	});

	it('returns null for empty arrays', () => {
		expect(parseDictionaryApiDevResponse('[]')).toBeNull();
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

		const result = parseDictionaryApiDevResponse(json);
		expect(result).not.toBeNull();
		expect(result?.word).toBe('admires');
		expect(result?.meanings[0]?.partOfSpeech).toBe('verb');
		expect(result?.meanings[0]?.definitions[0]?.text).toContain('amazed');
		expect(result?.meanings[0]?.definitions).toHaveLength(2);
	});
});

describe('parseMerriamWebsterResponse', () => {
	it('parses shortdef, phonetic, and attribution', () => {
		const json = JSON.stringify([
			{
				meta: { id: 'abide:1' },
				hwi: {
					hw: 'abide',
					prs: [{ mw: '\u0259\u02C8b\u012Bd' }]
				},
				fl: 'verb',
				shortdef: [
					'to bear patiently : tolerate',
					'to endure without yielding : withstand',
					'to wait for : await'
				]
			}
		]);

		const result = parseMerriamWebsterResponse(json, 'abide');
		expect(result).not.toBeNull();
		expect(result?.word).toBe('abide');
		expect(result?.phonetic).toBe('\u0259\u02C8b\u012Bd');
		expect(result?.meanings).toHaveLength(1);
		expect(result?.meanings[0]?.partOfSpeech).toBe('verb');
		expect(result?.meanings[0]?.definitions).toHaveLength(2);
		expect(result?.meanings[0]?.definitions[0]?.text).toBe('to bear patiently : tolerate');
		expect(result?.attribution).toEqual(MERRIAM_WEBSTER_ATTRIBUTION);
	});

	it('parses homographs into multiple meanings capped at MAX_MEANINGS', () => {
		const json = JSON.stringify([
			{
				meta: { id: 'test:1' },
				hom: 1,
				hwi: { hw: 'test', prs: [{ mw: '\u02C8test' }] },
				fl: 'noun',
				shortdef: ['a means of testing']
			},
			{
				meta: { id: 'test:2' },
				hom: 2,
				hwi: { hw: 'test' },
				fl: 'verb',
				shortdef: ['to put to test']
			},
			{
				meta: { id: 'test:3' },
				hom: 3,
				hwi: { hw: 'test' },
				fl: 'adjective',
				shortdef: ['of or relating to a test']
			}
		]);

		const result = parseMerriamWebsterResponse(json, 'test');
		expect(result?.meanings).toHaveLength(2);
		expect(result?.meanings[0]?.partOfSpeech).toBe('noun');
		expect(result?.meanings[1]?.partOfSpeech).toBe('verb');
	});

	it('returns null for suggestion arrays and empty arrays', () => {
		expect(parseMerriamWebsterResponse(JSON.stringify(['suggestion']), 'word')).toBeNull();
		expect(parseMerriamWebsterResponse('[]', 'word')).toBeNull();
	});
});

describe('stripMerriamWebsterTokens', () => {
	it('strips common inline tokens', () => {
		expect(stripMerriamWebsterTokens('{bc}to bear patiently : tolerate')).toBe(
			': to bear patiently : tolerate'
		);
	});
});

describe('parseFreeDictionaryApiResponse', () => {
	it('parses entries, senses, and attribution', () => {
		const json = JSON.stringify({
			word: 'ephemeral',
			entries: [
				{
					partOfSpeech: 'adjective',
					pronunciations: [{ text: '/ɪˈfɛməɹəl/' }],
					senses: [
						{
							definition: 'Lasting for a short period of time.',
							examples: ['An ephemeral pleasure.']
						},
						{ definition: 'Second sense.' }
					]
				}
			]
		});

		const result = parseFreeDictionaryApiResponse(json);
		expect(result).not.toBeNull();
		expect(result?.word).toBe('ephemeral');
		expect(result?.phonetic).toBe('/ɪˈfɛməɹəl/');
		expect(result?.meanings[0]?.definitions[0]?.example).toBe('An ephemeral pleasure.');
		expect(result?.attribution.label).toBe('FreeDictionaryAPI.com');
	});

	it('returns null for empty entries', () => {
		expect(parseFreeDictionaryApiResponse(JSON.stringify({ word: 'x', entries: [] }))).toBeNull();
	});
});
