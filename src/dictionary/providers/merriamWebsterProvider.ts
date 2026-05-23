import { MAX_DEFINITIONS_PER_MEANING, MAX_MEANINGS } from '../dictionaryLimits';
import type { DictionaryProvider, DictionaryRequestFn, ProviderLookupResult } from '../dictionaryProvider';
import type { DictionaryAttribution, DictionaryDefinition, DictionaryResult } from '../dictionaryTypes';

const API_BASE = 'https://www.dictionaryapi.com/api/v3/references/collegiate/json/';

export const MERRIAM_WEBSTER_ATTRIBUTION: DictionaryAttribution = {
	label: 'Merriam Webster',
	href: 'https://www.merriam-webster.com/'
};

interface MerriamWebsterEntry {
	meta?: { id?: string };
	hwi?: { hw?: string; prs?: { mw?: string }[] };
	fl?: string;
	shortdef?: string[];
	def?: MerriamWebsterDefSection[];
}

interface MerriamWebsterDefSection {
	sseq?: MerriamWebsterSenseGroup[][];
}

type MerriamWebsterSenseGroup = ['sense', MerriamWebsterSense] | [string, unknown];

interface MerriamWebsterSense {
	dt?: MerriamWebsterDtItem[];
}

type MerriamWebsterDtItem = ['text', string] | ['vis', { t?: string }[]] | [string, unknown];

export function stripMerriamWebsterTokens(text: string): string {
	return text
		.replace(/\{bc\}/g, ': ')
		.replace(/\{ldquo\}/g, '\u201C')
		.replace(/\{rdquo\}/g, '\u201D')
		.replace(/\{p_br\}/g, ' ')
		.replace(/\{[^}]+\}/g, (token) => {
			if (token.startsWith('{/')) {
				return '';
			}
			const match = token.match(/^\{(\w+)/);
			return match && ['it', 'b', 'sc', 'inf', 'sup'].includes(match[1]!) ? '' : '';
		})
		.replace(/\{\/[^}]+\}/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function formatHeadword(hw: string): string {
	return hw.replace(/\*/g, '-');
}

function extractDefinitionsFromDef(defSections: MerriamWebsterDefSection[] | undefined): DictionaryDefinition[] {
	const definitions: DictionaryDefinition[] = [];

	for (const section of defSections ?? []) {
		for (const group of section.sseq ?? []) {
			for (const item of group) {
				if (!Array.isArray(item) || item[0] !== 'sense') {
					continue;
				}
				const sense = item[1] as MerriamWebsterSense;
				let text = '';
				let example: string | undefined;

				for (const dtItem of sense.dt ?? []) {
					if (!Array.isArray(dtItem)) {
						continue;
					}
					if (dtItem[0] === 'text' && typeof dtItem[1] === 'string') {
						text = stripMerriamWebsterTokens(dtItem[1]);
					} else if (dtItem[0] === 'vis' && Array.isArray(dtItem[1])) {
						const visText = dtItem[1][0]?.t;
						if (visText) {
							example = stripMerriamWebsterTokens(visText);
						}
					}
				}

				if (text) {
					definitions.push({ text, example });
				}
			}
		}
	}

	return definitions;
}

function extractDefinitions(entry: MerriamWebsterEntry): DictionaryDefinition[] {
	const fromShortdef = (entry.shortdef ?? [])
		.map((text) => stripMerriamWebsterTokens(text))
		.filter((text) => text.length > 0)
		.map((text) => ({ text }));

	if (fromShortdef.length > 0) {
		return fromShortdef.slice(0, MAX_DEFINITIONS_PER_MEANING);
	}

	return extractDefinitionsFromDef(entry.def).slice(0, MAX_DEFINITIONS_PER_MEANING);
}

function isEntryObject(value: unknown): value is MerriamWebsterEntry {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseMerriamWebsterResponse(json: string, fallbackWord: string): DictionaryResult | null {
	const parsed = JSON.parse(json) as unknown;

	if (!Array.isArray(parsed) || parsed.length === 0) {
		return null;
	}

	if (typeof parsed[0] === 'string') {
		return null;
	}

	const entries = parsed.filter(isEntryObject);
	if (entries.length === 0) {
		return null;
	}

	const firstEntry = entries[0]!;
	const word =
		formatHeadword(firstEntry.hwi?.hw?.trim() || firstEntry.meta?.id?.split(':')[0] || fallbackWord);
	const phonetic = firstEntry.hwi?.prs?.find((item) => item.mw?.trim())?.mw?.trim();

	const meanings = entries
		.filter((entry) => entry.fl?.trim())
		.slice(0, MAX_MEANINGS)
		.map((entry) => ({
			partOfSpeech: entry.fl!.trim(),
			definitions: extractDefinitions(entry).filter((definition) => definition.text.length > 0)
		}))
		.filter((meaning) => meaning.definitions.length > 0);

	if (meanings.length === 0) {
		return null;
	}

	return {
		word,
		phonetic: phonetic || undefined,
		meanings,
		attribution: MERRIAM_WEBSTER_ATTRIBUTION
	};
}

export class MerriamWebsterProvider implements DictionaryProvider {
	readonly id = 'merriamWebster';

	constructor(
		private readonly requestFn: DictionaryRequestFn,
		private readonly apiKey: string
	) {}

	async lookup(word: string): Promise<ProviderLookupResult> {
		try {
			const response = await this.requestFn({
				url: `${API_BASE}${encodeURIComponent(word)}?key=${encodeURIComponent(this.apiKey)}`
			});
			const result = parseMerriamWebsterResponse(response, word);
			if (!result) {
				return { status: 'miss' };
			}
			return { status: 'found', result };
		} catch (error: unknown) {
			const status = (error as { status?: number })?.status;
			if (status === 401 || status === 403 || status === 429) {
				return { status: 'unavailable' };
			}
			return { status: 'unavailable' };
		}
	}
}
