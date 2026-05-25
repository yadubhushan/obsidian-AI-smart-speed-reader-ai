import { parseTrailingPunctuation } from '../engine/readingNavigation';
import { stripLeadingPunctuation } from '../services/textParser';
import type { ReaderState } from '../types';
import type { DictionaryLookupOutcome } from './dictionaryTypes';

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

export function stripPunctuationForLookup(raw: string): string {
	let word = raw.trim();
	const { clean: withoutLeading } = stripLeadingPunctuation(word);
	word = withoutLeading;
	const { word: withoutTrailing } = parseTrailingPunctuation(word);
	return withoutTrailing;
}

export function normalizeWordForLookup(raw: string): string | null {
	let word = stripPunctuationForLookup(raw).toLowerCase();
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
		return stripPunctuationForLookup(state.displayToken.text);
	}
	return null;
}
