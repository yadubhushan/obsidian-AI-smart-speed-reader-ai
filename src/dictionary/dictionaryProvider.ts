import type { DictionaryResult } from './dictionaryTypes';

export type ProviderLookupResult =
	| { status: 'found'; result: DictionaryResult }
	| { status: 'miss' }
	| { status: 'unavailable' };

export interface DictionaryProvider {
	readonly id: string;
	lookup(word: string): Promise<ProviderLookupResult>;
}

export type DictionaryRequestFn = (options: { url: string }) => Promise<string>;
