import { request } from 'obsidian';
import {
	getCachedDictionaryOutcome,
	normalizeWordForLookup,
	setCachedDictionaryOutcome
} from './dictionaryLookup';
import type { DictionaryProvider, DictionaryRequestFn } from './dictionaryProvider';
import type { DictionaryLookupOutcome } from './dictionaryTypes';
import { DictionaryApiDevProvider } from './providers/dictionaryApiDevProvider';
import { FreeDictionaryApiProvider } from './providers/freeDictionaryApiProvider';

export type { DictionaryRequestFn } from './dictionaryProvider';

function createDefaultProviders(requestFn: DictionaryRequestFn): DictionaryProvider[] {
	return [
		new DictionaryApiDevProvider(requestFn),
		new FreeDictionaryApiProvider(requestFn)
	];
}

export class DictionaryLookupService {
	private readonly providers: DictionaryProvider[];

	constructor(
		requestFn: DictionaryRequestFn = (options) => request(options),
		private cacheEnabled = true,
		providers?: DictionaryProvider[]
	) {
		this.providers = providers ?? createDefaultProviders(requestFn);
	}

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

		let sawMiss = false;
		let sawUnavailable = false;

		for (const provider of this.providers) {
			const providerResult = await provider.lookup(normalized);
			if (providerResult.status === 'found') {
				const outcome: DictionaryLookupOutcome = {
					kind: 'found',
					result: providerResult.result
				};
				if (this.cacheEnabled) {
					setCachedDictionaryOutcome(normalized, outcome);
				}
				return outcome;
			}
			if (providerResult.status === 'miss') {
				sawMiss = true;
			} else {
				sawUnavailable = true;
			}
		}

		if (sawUnavailable && !sawMiss) {
			return { kind: 'error', message: 'Dictionary temporarily unavailable.' };
		}

		const outcome: DictionaryLookupOutcome = { kind: 'not_found', word: normalized };
		if (this.cacheEnabled) {
			setCachedDictionaryOutcome(normalized, outcome);
		}
		return outcome;
	}
}
