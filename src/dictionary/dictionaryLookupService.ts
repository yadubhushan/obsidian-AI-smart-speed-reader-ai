import { request } from 'obsidian';
import {
	getCachedDictionaryOutcome,
	normalizeWordForLookup,
	parseFreeDictionaryResponse,
	setCachedDictionaryOutcome
} from './dictionaryLookup';
import type { DictionaryLookupOutcome } from './dictionaryTypes';

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

export type DictionaryRequestFn = (options: { url: string }) => Promise<string>;

export class DictionaryLookupService {
	constructor(
		private readonly requestFn: DictionaryRequestFn = (options) => request(options),
		private cacheEnabled = true
	) {}

	setCacheEnabled(enabled: boolean): void {
		this.cacheEnabled = enabled;
	}

	async lookup(word: string): Promise<DictionaryLookupOutcome> {
		const normalized = normalizeWordForLookup(word);
		if (!normalized) {
			return { kind: 'error', message: 'No valid word to look up.' };
		}

		if (this.cacheEnabled) {
			const cached = getCachedDictionaryOutcome(normalized);
			if (cached) {
				return cached;
			}
		}

		try {
			const response = await this.requestFn({
				url: `${API_BASE}${encodeURIComponent(normalized)}`
			});
			const result = parseFreeDictionaryResponse(response);
			if (!result) {
				const outcome: DictionaryLookupOutcome = { kind: 'not_found', word: normalized };
				if (this.cacheEnabled) {
					setCachedDictionaryOutcome(normalized, outcome);
				}
				return outcome;
			}

			const outcome: DictionaryLookupOutcome = { kind: 'found', result };
			if (this.cacheEnabled) {
				setCachedDictionaryOutcome(normalized, outcome);
			}
			return outcome;
		} catch {
			const outcome: DictionaryLookupOutcome = {
				kind: 'not_found',
				word: normalized
			};
			if (this.cacheEnabled) {
				setCachedDictionaryOutcome(normalized, outcome);
			}
			return outcome;
		}
	}
}
