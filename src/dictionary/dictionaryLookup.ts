import type { ReaderState } from '../types';
import type { DictionaryLookupOutcome, DictionaryResult } from './dictionaryTypes';

const MAX_MEANINGS = 2;
const MAX_DEFINITIONS_PER_MEANING = 2;

interface FreeDictEntry {
	word: string;
	phonetic?: string;
	phonetics?: { text?: string }[];
	meanings?: {
		partOfSpeech: string;
		definitions?: { definition: string; example?: string }[];
	}[];
}

const sessionCache = new Map<string, DictionaryLookupOutcome>();

export function clearDictionarySessionCache(): void {
	sessionCache.clear();
}

export function getCachedDictionaryOutcome(word: string): DictionaryLookupOutcome | undefined {
	return sessionCache.get(word);
}

export function setCachedDictionaryOutcome(word: string, outcome: DictionaryLookupOutcome): void {
	sessionCache.set(word, outcome);
}

export function normalizeWordForLookup(raw: string): string | null {
	let word = raw.trim().toLowerCase();
	if (word.endsWith("'s")) {
		word = word.slice(0, -2);
	}
	word = word.replace(/^-+|-+$/g, '');
	if (!word.length) {
		return null;
	}
	if (!/^[a-z]+(-[a-z]+)*$/i.test(word)) {
		return null;
	}
	return word;
}

export function extractLookupWordFromReaderState(state: ReaderState | null): string | null {
	if (!state || state.finished) {
		return null;
	}
	if (state.displayToken && state.displayToken.kind !== 'word') {
		return null;
	}
	if (state.chunk.length > 0) {
		return state.chunk[0]!.word;
	}
	if (state.displayToken?.kind === 'word' && state.displayToken.text) {
		return state.displayToken.text;
	}
	return null;
}

export function parseFreeDictionaryResponse(json: string): DictionaryResult | null {
	const parsed = JSON.parse(json) as FreeDictEntry[] | { title?: string };
	if (!Array.isArray(parsed) || parsed.length === 0) {
		return null;
	}

	const entry = parsed[0]!;
	const phonetic =
		entry.phonetic?.trim() ||
		entry.phonetics?.find((item) => item.text?.trim())?.text?.trim();

	const meanings = (entry.meanings ?? [])
		.slice(0, MAX_MEANINGS)
		.map((meaning) => ({
			partOfSpeech: meaning.partOfSpeech,
			definitions: (meaning.definitions ?? [])
				.slice(0, MAX_DEFINITIONS_PER_MEANING)
				.map((definition) => ({
					text: definition.definition,
					example: definition.example
				}))
				.filter((definition) => definition.text.trim().length > 0)
		}))
		.filter((meaning) => meaning.definitions.length > 0);

	if (meanings.length === 0) {
		return null;
	}

	return {
		word: entry.word,
		phonetic,
		meanings
	};
}
