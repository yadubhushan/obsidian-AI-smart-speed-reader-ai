import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	clearDictionarySessionCache,
	getCachedDictionaryOutcome
} from '../src/dictionary/dictionaryLookup';
import { DictionaryLookupService } from '../src/dictionary/dictionaryLookupService';
import type { DictionaryProvider } from '../src/dictionary/dictionaryProvider';
import { DICTIONARY_API_DEV_ATTRIBUTION } from '../src/dictionary/providers/dictionaryApiDevProvider';
import { FREE_DICTIONARY_API_ATTRIBUTION } from '../src/dictionary/providers/freeDictionaryApiProvider';

function mockProvider(
	id: string,
	lookup: DictionaryProvider['lookup']
): DictionaryProvider {
	return { id, lookup };
}

describe('DictionaryLookupService', () => {
	beforeEach(() => {
		clearDictionarySessionCache();
	});

	it('uses cache when enabled', async () => {
		const lookup = vi.fn(async () => ({
			status: 'found' as const,
			result: {
				word: 'test',
				meanings: [{ partOfSpeech: 'noun', definitions: [{ text: 'A trial.' }] }],
				attribution: DICTIONARY_API_DEV_ATTRIBUTION
			}
		}));
		const service = new DictionaryLookupService(vi.fn(), true, [
			mockProvider('primary', lookup)
		]);

		const first = await service.lookup('test');
		const second = await service.lookup('test');

		expect(first.kind).toBe('found');
		expect(second.kind).toBe('found');
		expect(lookup).toHaveBeenCalledTimes(1);
		expect(getCachedDictionaryOutcome('test')?.kind).toBe('found');
	});

	it('chains to backup when primary misses', async () => {
		const primary = vi.fn(async () => ({ status: 'miss' as const }));
		const backup = vi.fn(async () => ({
			status: 'found' as const,
			result: {
				word: 'rareword',
				meanings: [{ partOfSpeech: 'noun', definitions: [{ text: 'Uncommon.' }] }],
				attribution: FREE_DICTIONARY_API_ATTRIBUTION
			}
		}));
		const service = new DictionaryLookupService(vi.fn(), false, [
			mockProvider('primary', primary),
			mockProvider('backup', backup)
		]);

		const outcome = await service.lookup('rareword');
		expect(outcome.kind).toBe('found');
		if (outcome.kind === 'found') {
			expect(outcome.result.attribution.label).toBe('FreeDictionaryAPI.com');
		}
		expect(primary).toHaveBeenCalledOnce();
		expect(backup).toHaveBeenCalledOnce();
	});

	it('returns not_found when all providers miss', async () => {
		const miss = vi.fn(async () => ({ status: 'miss' as const }));
		const service = new DictionaryLookupService(vi.fn(), false, [
			mockProvider('primary', miss),
			mockProvider('backup', miss)
		]);

		const outcome = await service.lookup('missingword');
		expect(outcome).toEqual({ kind: 'not_found', word: 'missingword' });
	});

	it('returns error when all providers are unavailable and none miss', async () => {
		const unavailable = vi.fn(async () => ({ status: 'unavailable' as const }));
		const service = new DictionaryLookupService(vi.fn(), false, [
			mockProvider('a', unavailable),
			mockProvider('b', unavailable)
		]);

		const outcome = await service.lookup('word');
		expect(outcome).toEqual({
			kind: 'error',
			message: 'Dictionary temporarily unavailable.'
		});
	});

	it('caches final not_found after full chain', async () => {
		const miss = vi.fn(async () => ({ status: 'miss' as const }));
		const service = new DictionaryLookupService(vi.fn(), true, [
			mockProvider('primary', miss),
			mockProvider('backup', miss)
		]);

		await service.lookup('missing');
		await service.lookup('missing');

		expect(miss).toHaveBeenCalledTimes(2);
		expect(getCachedDictionaryOutcome('missing')).toEqual({
			kind: 'not_found',
			word: 'missing'
		});
	});
});
