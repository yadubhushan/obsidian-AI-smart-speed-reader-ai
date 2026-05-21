import { describe, expect, it } from 'vitest';
import { StoryDocumentProcessor } from '../src/prepare/processors/storyDocumentProcessor';
import {
	defaultProcessorDeps,
	mockLlmClient,
	overviewBundle,
	oversizedBundle,
	storyLlmResponse
} from './prepareFixtures';

describe('StoryDocumentProcessor', () => {
	const processor = new StoryDocumentProcessor();

	it('uses one LLM call for overview-scale bundle under threshold', async () => {
		let calls = 0;
		const llm = {
			complete: async () => {
				calls++;
				return storyLlmResponse();
			}
		};
		const result = await processor.process(
			overviewBundle(),
			defaultProcessorDeps(llm)
		);
		expect(calls).toBe(1);
		expect(result.kind).toBe('single_story');
		expect(result.meta.prepareStrategy).toBe('single');
		expect(result.stream.length).toBeGreaterThan(0);
	});

	it('returns continuous stream tokens', async () => {
		const llm = mockLlmClient([storyLlmResponse()]);
		const result = await processor.process(
			overviewBundle(),
			defaultProcessorDeps(llm)
		);
		expect(result.stream.some((t) => t.kind === 'word')).toBe(true);
	});

	it('uses batched strategy and merges chunk bodies into one stream', async () => {
		const bundle = oversizedBundle(overviewBundle());
		const chunkResponse = JSON.stringify({
			body: 'Chunk prose.'
		});
		let calls = 0;
		const llm = {
			complete: async () => {
				calls++;
				return chunkResponse;
			}
		};
		const result = await processor.process(
			bundle,
			defaultProcessorDeps(llm, { prepareSingleCallMaxChars: 100 })
		);
		expect(result.meta.prepareStrategy).toBe('batched');
		expect(calls).toBeGreaterThan(1);
		expect(result.stream.some((t) => t.kind === 'word')).toBe(true);
		expect(result.stream.some((t) => t.kind === 'section_break')).toBe(false);
	});

	it('exposes single_story ReaderUxProfile', () => {
		const ux = processor.getReaderUxProfile();
		expect(ux.sectionNav).toBe(false);
		expect(ux.progressScope).toBe('document');
	});
});
