import { MAX_DEFINITIONS_PER_MEANING, MAX_MEANINGS } from '../dictionaryLimits';
import type { DictionaryProvider, DictionaryRequestFn, ProviderLookupResult } from '../dictionaryProvider';
import type { DictionaryAttribution, DictionaryResult } from '../dictionaryTypes';

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

export const DICTIONARY_API_DEV_ATTRIBUTION: DictionaryAttribution = {
	label: 'dictionaryapi.dev',
	href: 'https://dictionaryapi.dev/'
};

interface DictionaryApiDevEntry {
	word: string;
	phonetic?: string;
	phonetics?: { text?: string }[];
	meanings?: {
		partOfSpeech: string;
		definitions?: { definition: string; example?: string }[];
	}[];
}

export function parseDictionaryApiDevResponse(json: string): DictionaryResult | null {
	const parsed = JSON.parse(json) as DictionaryApiDevEntry[] | { title?: string };
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
		meanings,
		attribution: DICTIONARY_API_DEV_ATTRIBUTION
	};
}

export class DictionaryApiDevProvider implements DictionaryProvider {
	readonly id = 'dictionaryApiDev';

	constructor(private readonly requestFn: DictionaryRequestFn) {}

	async lookup(word: string): Promise<ProviderLookupResult> {
		try {
			const response = await this.requestFn({
				url: `${API_BASE}${encodeURIComponent(word)}`
			});
			const result = parseDictionaryApiDevResponse(response);
			if (!result) {
				return { status: 'miss' };
			}
			return { status: 'found', result };
		} catch {
			return { status: 'miss' };
		}
	}
}
