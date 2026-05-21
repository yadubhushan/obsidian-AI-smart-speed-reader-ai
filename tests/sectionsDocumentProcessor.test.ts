import { describe, expect, it } from 'vitest';
import { SectionsDocumentProcessor } from '../src/prepare/processors/sectionsDocumentProcessor';
import {
	defaultProcessorDeps,
	mockLlmClient,
	overviewBundle,
	oversizedBundle,
	sectionsLlmResponse
} from './prepareFixtures';

describe('SectionsDocumentProcessor', () => {
	const processor = new SectionsDocumentProcessor();

	it('uses one LLM call for overview-scale bundle under threshold', async () => {
		let calls = 0;
		const llm = {
			complete: async () => {
				calls++;
				return sectionsLlmResponse();
			}
		};
		const result = await processor.process(
			overviewBundle(),
			defaultProcessorDeps(llm)
		);
		expect(calls).toBe(1);
		expect(result.kind).toBe('sections');
		expect(result.meta.prepareStrategy).toBe('single');
		expect(result.sections.length).toBeGreaterThan(0);
		expect(result.sections[0]!.sectionId).toMatch(/^\d{2}-/);
	});

	it('assigns stable section ids from titles', async () => {
		const llm = mockLlmClient([sectionsLlmResponse()]);
		const result = await processor.process(
			overviewBundle(),
			defaultProcessorDeps(llm)
		);
		expect(result.sections[0]!.sectionId).toBe('01-aws-vs-gcp');
		expect(result.sections[1]!.sectionId).toBe('02-networking');
	});

	it('uses batched strategy when bundle exceeds char threshold', async () => {
		const bundle = overviewBundle();
		const oversized = oversizedBundle(bundle);
		const chunkResponse = JSON.stringify({
			sections: [
				{
					title: 'Chunk section',
					body: 'Part one.'
				}
			]
		});
		let calls = 0;
		const llm = {
			complete: async () => {
				calls++;
				return chunkResponse;
			}
		};
		const result = await processor.process(
			oversized,
			defaultProcessorDeps(llm, { prepareSingleCallMaxChars: 100 })
		);
		expect(result.meta.prepareStrategy).toBe('batched');
		expect(calls).toBeGreaterThan(1);
		expect(result.sections.length).toBeGreaterThan(1);
	});

	it('exposes sections ReaderUxProfile', () => {
		const ux = processor.getReaderUxProfile();
		expect(ux.sectionNav).toBe(true);
		expect(ux.interSectionPause).toBe(true);
	});
});
