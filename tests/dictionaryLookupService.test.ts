import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	clearDictionarySessionCache,
	getCachedDictionaryOutcome,
	setCachedDictionaryOutcome
} from '../src/dictionary/dictionaryLookup';
import { DictionaryLookupService } from '../src/dictionary/dictionaryLookupService';

describe('DictionaryLookupService', () => {
	beforeEach(() => {
		clearDictionarySessionCache();
	});

	it('uses cache when enabled', async () => {
		const requestFn = vi.fn(async () =>
			JSON.stringify([
				{
					word: 'test',
					meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A trial.' }] }]
				}
			])
		);
		const service = new DictionaryLookupService(requestFn, true);

		const first = await service.lookup('test');
		const second = await service.lookup('test');

		expect(first.kind).toBe('found');
		expect(second.kind).toBe('found');
		expect(requestFn).toHaveBeenCalledTimes(1);
		expect(getCachedDictionaryOutcome('test')?.kind).toBe('found');
	});

	it('returns not_found when request fails', async () => {
		const requestFn = vi.fn(async () => {
			throw new Error('404');
		});
		const service = new DictionaryLookupService(requestFn, false);

		const outcome = await service.lookup('missingword');
		expect(outcome).toEqual({ kind: 'not_found', word: 'missingword' });
	});

	it('stores outcomes in session cache helpers', () => {
		setCachedDictionaryOutcome('cached', { kind: 'not_found', word: 'cached' });
		expect(getCachedDictionaryOutcome('cached')).toEqual({ kind: 'not_found', word: 'cached' });
	});
});
