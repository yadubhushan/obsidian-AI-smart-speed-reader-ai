import { describe, expect, it } from 'vitest';
import {
	getDocumentProcessor,
	listDocumentProcessors
} from '../src/prepare/documentProcessorRegistry';
import { processDocument } from '../src/prepare/processDocument';
import {
	defaultProcessorDeps,
	overviewBundle,
	sectionsLlmResponse
} from './prepareFixtures';

describe('documentProcessorRegistry', () => {
	it('lists both M1 processors', () => {
		const processors = listDocumentProcessors();
		expect(processors).toHaveLength(2);
		const ids = processors.map((p) => p.id).sort();
		expect(ids).toEqual(['sections', 'single_story']);
	});

	it('returns distinct ReaderUxProfile per processor', () => {
		const sections = getDocumentProcessor('sections');
		const story = getDocumentProcessor('single_story');
		const sectionsUx = sections.getReaderUxProfile();
		const storyUx = story.getReaderUxProfile();
		expect(sectionsUx.sectionNav).toBe(true);
		expect(storyUx.sectionNav).toBe(false);
		expect(sectionsUx.progressScope).toBe('section');
		expect(storyUx.progressScope).toBe('document');
		expect(sectionsUx.arrowKeys).toBe('section');
		expect(storyUx.arrowKeys).toBe('wordSkip');
	});

	it('processDocument delegates to registry', async () => {
		let calls = 0;
		const llm = {
			complete: async () => {
				calls++;
				return sectionsLlmResponse();
			}
		};
		const result = await processDocument(
			'sections',
			overviewBundle(),
			defaultProcessorDeps(llm)
		);
		expect(result.kind).toBe('sections');
		expect(calls).toBe(1);
	});

	it('throws for unknown processor id', () => {
		expect(() =>
			getDocumentProcessor('unknown' as 'sections')
		).toThrow(/Unknown document processor/);
	});
});
