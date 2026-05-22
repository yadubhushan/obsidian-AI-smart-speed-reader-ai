import { MAX_DEFINITIONS_PER_MEANING, MAX_MEANINGS } from '../dictionaryLimits';
import type { DictionaryProvider, DictionaryRequestFn, ProviderLookupResult } from '../dictionaryProvider';
import type { DictionaryAttribution, DictionaryResult } from '../dictionaryTypes';

const API_BASE = 'https://freedictionaryapi.com/api/v1/entries/en/';

export const FREE_DICTIONARY_API_ATTRIBUTION: DictionaryAttribution = {
	label: 'FreeDictionaryAPI.com',
	href: 'https://freedictionaryapi.com/'
};

interface FreeDictionaryApiSense {
	definition?: string;
	examples?: string[];
	subsenses?: FreeDictionaryApiSense[];
}

interface FreeDictionaryApiEntry {
	partOfSpeech?: string;
	pronunciations?: { text?: string }[];
	senses?: FreeDictionaryApiSense[];
}

interface FreeDictionaryApiResponse {
	word?: string;
	entries?: FreeDictionaryApiEntry[];
}

function collectSenseDefinitions(senses: FreeDictionaryApiSense[] | undefined): {
	text: string;
	example?: string;
}[] {
	const definitions: { text: string; example?: string }[] = [];
	for (const sense of senses ?? []) {
		const text = sense.definition?.trim();
		if (text) {
			definitions.push({
				text,
				example: sense.examples?.[0]?.trim() || undefined
			});
		}
	}
	return definitions;
}

export function parseFreeDictionaryApiResponse(json: string): DictionaryResult | null {
	const parsed = JSON.parse(json) as FreeDictionaryApiResponse;
	if (!parsed.entries?.length) {
		return null;
	}

	const phonetic = parsed.entries
		.flatMap((entry) => entry.pronunciations ?? [])
		.map((item) => item.text?.trim())
		.find(Boolean);

	const meanings = parsed.entries
		.filter((entry) => entry.partOfSpeech?.trim())
		.slice(0, MAX_MEANINGS)
		.map((entry) => ({
			partOfSpeech: entry.partOfSpeech!.trim(),
			definitions: collectSenseDefinitions(entry.senses)
				.slice(0, MAX_DEFINITIONS_PER_MEANING)
				.filter((definition) => definition.text.length > 0)
		}))
		.filter((meaning) => meaning.definitions.length > 0);

	if (meanings.length === 0) {
		return null;
	}

	return {
		word: parsed.word?.trim() || '',
		phonetic: phonetic || undefined,
		meanings,
		attribution: FREE_DICTIONARY_API_ATTRIBUTION
	};
}

export class FreeDictionaryApiProvider implements DictionaryProvider {
	readonly id = 'freeDictionaryApi';

	constructor(private readonly requestFn: DictionaryRequestFn) {}

	async lookup(word: string): Promise<ProviderLookupResult> {
		try {
			const response = await this.requestFn({
				url: `${API_BASE}${encodeURIComponent(word)}`
			});
			const result = parseFreeDictionaryApiResponse(response);
			if (!result) {
				return { status: 'miss' };
			}
			if (!result.word) {
				result.word = word;
			}
			return { status: 'found', result };
		} catch (error: unknown) {
			const status = (error as { status?: number })?.status;
			if (status === 429) {
				return { status: 'unavailable' };
			}
			return { status: 'miss' };
		}
	}
}
