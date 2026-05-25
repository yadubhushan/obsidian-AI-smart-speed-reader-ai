import { describe, expect, it } from 'vitest';
import {
	appendDictionaryEntry,
	dictionaryHasWord,
	formatDictionaryEntry
} from '../src/dictionary/dictionaryEntryFormat';
import type { DictionaryResult } from '../src/dictionary/dictionaryTypes';
import { normalizeDictionaryVaultPath } from '../src/dictionary/dictionarySaveService';
import { DEFAULT_SETTINGS } from '../src/types';
import { createDefaultLlmModelCatalog } from '../src/llm/llmModelCatalog';
import { validateSettings } from '../src/services/settingsValidator';

const sampleResult: DictionaryResult = {
	word: 'ephemeral',
	phonetic: '/ɪˈfɛmərəl/',
	meanings: [
		{
			partOfSpeech: 'adjective',
			definitions: [{ text: 'lasting a very short time' }]
		},
		{
			partOfSpeech: 'noun',
			definitions: [{ text: 'something that lasts for a very short time' }]
		}
	],
	attribution: {
		label: 'dictionaryapi.dev',
		href: 'https://dictionaryapi.dev/'
	}
};

describe('formatDictionaryEntry', () => {
	it('formats word, pronunciation, meanings, and date', () => {
		const block = formatDictionaryEntry(sampleResult, new Date('2026-05-25T12:00:00'));
		expect(block).toContain('### ephemeral');
		expect(block).toContain('**Pronunciation:** /ɪˈfɛmərəl/');
		expect(block).toContain('- *adjective* — lasting a very short time');
		expect(block).toContain('- *noun* — something that lasts for a very short time');
		expect(block).toContain('Added: 2026-05-25');
	});

	it('omits pronunciation when absent', () => {
		const block = formatDictionaryEntry(
			{ ...sampleResult, phonetic: undefined },
			new Date('2026-05-25T12:00:00')
		);
		expect(block).not.toContain('**Pronunciation:**');
	});
});

describe('dictionaryHasWord', () => {
	it('detects existing words case-insensitively', () => {
		const content = appendDictionaryEntry('', formatDictionaryEntry(sampleResult, new Date()));
		expect(dictionaryHasWord(content, 'Ephemeral')).toBe(true);
		expect(dictionaryHasWord(content, 'other')).toBe(false);
	});
});

describe('appendDictionaryEntry', () => {
	it('creates a new dictionary file with header', () => {
		const block = formatDictionaryEntry(sampleResult, new Date('2026-05-25T12:00:00'));
		const next = appendDictionaryEntry('', block);
		expect(next.startsWith('# Dictionary\n\n### ephemeral')).toBe(true);
	});

	it('appends to existing content', () => {
		const first = appendDictionaryEntry('', formatDictionaryEntry(sampleResult, new Date('2026-05-25T12:00:00')));
		const second = appendDictionaryEntry(
			first,
			formatDictionaryEntry({ ...sampleResult, word: 'fleeting' }, new Date('2026-05-26T12:00:00'))
		);
		expect(second).toContain('### ephemeral');
		expect(second).toContain('### fleeting');
	});
});

describe('normalizeDictionaryVaultPath', () => {
	it('strips leading slashes and falls back to default', () => {
		expect(normalizeDictionaryVaultPath('/docs/dictionary.md')).toBe('docs/dictionary.md');
		expect(normalizeDictionaryVaultPath('   ')).toBe('dictionary.md');
	});
});

describe('validateSettings dictionaryNotePath', () => {
	const defaultCatalog = createDefaultLlmModelCatalog();

	it('defaults to dictionary.md', () => {
		expect(validateSettings(null, defaultCatalog).dictionary.dictionaryNotePath).toBe(
			DEFAULT_SETTINGS.dictionary.dictionaryNotePath
		);
	});

	it('normalizes stored path values', () => {
		const result = validateSettings(
			{ dictionary: { ...DEFAULT_SETTINGS.dictionary, dictionaryNotePath: '/notes/words.md' } },
			defaultCatalog
		);
		expect(result.dictionary.dictionaryNotePath).toBe('notes/words.md');
	});
});
