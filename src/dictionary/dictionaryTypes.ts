export interface DictionaryDefinition {
	text: string;
	example?: string;
}

export interface DictionaryMeaning {
	partOfSpeech: string;
	definitions: DictionaryDefinition[];
}

export interface DictionaryResult {
	word: string;
	phonetic?: string;
	meanings: DictionaryMeaning[];
}

export type DictionaryLookupOutcome =
	| { kind: 'found'; result: DictionaryResult }
	| { kind: 'not_found'; word: string }
	| { kind: 'error'; message: string };
