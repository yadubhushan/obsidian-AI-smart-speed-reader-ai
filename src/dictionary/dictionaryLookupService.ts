import { request } from 'obsidian';
import {
	clearDictionarySessionCache,
	getCachedDictionaryOutcome,
	normalizeWordForLookup,
	setCachedDictionaryOutcome
} from './dictionaryLookup';
import type { DictionaryProvider, DictionaryRequestFn } from './dictionaryProvider';
import type { DictionaryLookupOutcome } from './dictionaryTypes';
import { DictionaryApiDevProvider } from './providers/dictionaryApiDevProvider';
import { FreeDictionaryApiProvider } from './providers/freeDictionaryApiProvider';
import { MerriamWebsterProvider } from './providers/merriamWebsterProvider';

export type { DictionaryRequestFn } from './dictionaryProvider';

function createProviders(
	requestFn: DictionaryRequestFn,
	merriamWebsterApiKey?: string
): DictionaryProvider[] {
	const providers: DictionaryProvider[] = [];
	const key = merriamWebsterApiKey?.trim();
	if (key) {
		providers.push(new MerriamWebsterProvider(requestFn, key));
	}
	providers.push(new DictionaryApiDevProvider(requestFn));
	providers.push(new FreeDictionaryApiProvider(requestFn));
	return providers;
}

export class DictionaryLookupService {
	private providers: DictionaryProvider[];
	private cacheEnabled = true;
	private configuredMerriamWebsterApiKey = '';

	constructor(
		private readonly requestFn: DictionaryRequestFn = (options) => request(options),
		cacheEnabled = true,
		providers?: DictionaryProvider[]
	) {
		this.cacheEnabled = cacheEnabled;
		this.providers = providers ?? createProviders(this.requestFn);
	}

	configure(options: { merriamWebsterApiKey?: string; cacheEnabled?: boolean }): void {
		if (options.cacheEnabled !== undefined) {
			this.cacheEnabled = options.cacheEnabled;
		}

		const nextKey = options.merriamWebsterApiKey?.trim() ?? this.configuredMerriamWebsterApiKey;
		if (nextKey !== this.configuredMerriamWebsterApiKey) {
			this.configuredMerriamWebsterApiKey = nextKey;
			clearDictionarySessionCache();
		}

		this.providers = createProviders(this.requestFn, nextKey);
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
