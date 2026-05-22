import { describe, expect, it } from 'vitest';
import {
	needsBatching,
	splitBundleIntoChunks,
	mergeSectionsResults,
	mergeStoryResults,
	slugifySectionTitle
} from '../src/prepare/batchBySize';
import { overviewBundle, oversizedBundle } from './prepareFixtures';
import { validateProcessedDocument, parseDocumentCacheIndex } from '../src/prepare/validateProcessedDocument';
import { sampleSectionsProcessed } from './prepareFixtures';

describe('batchBySize', () => {
	it('needsBatching respects char threshold', () => {
		const bundle = overviewBundle();
		expect(needsBatching(bundle, 120_000)).toBe(false);
		expect(needsBatching(oversizedBundle(bundle), 120_000)).toBe(true);
	});

	it('splitBundleIntoChunks returns single chunk when under threshold', () => {
		const bundle = overviewBundle();
		const chunks = splitBundleIntoChunks(bundle, 120_000);
		expect(chunks).toHaveLength(1);
	});

	it('splitBundleIntoChunks splits oversized bundle into multiple chunks', () => {
		const bundle = overviewBundle();
		const chunks = splitBundleIntoChunks(bundle, 500);
		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) {
			expect(chunk.sections.length).toBeGreaterThan(0);
		}
	});

	it('mergeSectionsResults concatenates section arrays', () => {
		const merged = mergeSectionsResults([
			{ sections: [{ title: 'A', body: 'Section a.' }] },
			{ sections: [{ title: 'B', body: 'Section b.' }] }
		]);
		expect(merged.sections).toHaveLength(2);
	});

	it('mergeStoryResults joins chunk bodies with paragraph break', () => {
		const merged = mergeStoryResults([
			{ body: 'First chunk.' },
			{ body: 'Second chunk.' }
		]);
		expect(merged.body).toBe('First chunk.\n\nSecond chunk.');
	});

	it('slugifySectionTitle produces filesystem-safe slugs', () => {
		expect(slugifySectionTitle('AWS vs GCP')).toBe('aws-vs-gcp');
	});
});

describe('validateProcessedDocument', () => {
	it('accepts valid sections ProcessedDocument', () => {
		expect(validateProcessedDocument(sampleSectionsProcessed())).not.toBeNull();
	});

	it('rejects incomplete v2 cache index', () => {
		expect(parseDocumentCacheIndex({ version: 2 })).toBeNull();
		expect(parseDocumentCacheIndex({ version: 3 })).toBeNull();
	});

	it('rejects ProcessedDocument with empty stream', () => {
		const bad = {
			kind: 'single_story',
			processorId: 'single_story',
			meta: sampleSectionsProcessed().meta,
			stream: []
		};
		expect(validateProcessedDocument(bad)).toBeNull();
	});
});
