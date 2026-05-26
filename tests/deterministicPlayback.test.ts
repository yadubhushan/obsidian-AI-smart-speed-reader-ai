import { describe, it, expect } from 'vitest';
import {
	bundleToSectionsProcessed,
	bundleToStoryProcessed,
	segmentsToStream,
	findStoryTokenIndexForOffset
} from '../src/prepare/deterministicPlayback';
import type { NormalizedSegment } from '../src/parse/normalizeTypes';
import { overviewBundle } from './prepareFixtures';
import { parseSegments } from '../src/parse/segmentParser';
import { OVERVIEW_EXCERPT } from './prepareFixtures';

function wordTexts(stream: ReturnType<typeof segmentsToStream>): string[] {
	return stream.filter((t) => t.kind === 'word').map((t) => t.text ?? '');
}

describe('deterministicPlayback', () => {
	it('segmentsToStream produces word and image tokens', () => {
		const bundle = overviewBundle();
		const allSegments = bundle.sections.flatMap((s) => s.segments);
		const stream = segmentsToStream(allSegments);
		expect(stream.some((t) => t.kind === 'word')).toBe(true);
		expect(stream.some((t) => t.kind === 'image')).toBe(true);
	});

	it('bundleToSectionsProcessed has one section per source section', () => {
		const bundle = overviewBundle();
		const processed = bundleToSectionsProcessed(bundle);
		expect(processed.kind).toBe('sections');
		if (processed.kind === 'sections') {
			expect(processed.sections.length).toBe(bundle.sections.length);
			expect(processed.meta.model).toBe('deterministic');
			for (const section of processed.sections) {
				expect(section.stream.length).toBeGreaterThan(0);
			}
		}
	});

	it('bundleToStoryProcessed merges sections with section_break', () => {
		const bundle = overviewBundle();
		const processed = bundleToStoryProcessed(bundle);
		expect(processed.kind).toBe('single_story');
		if (processed.kind === 'single_story') {
			expect(processed.stream.some((t) => t.kind === 'section_break')).toBe(true);
			expect(processed.meta.model).toBe('deterministic');
		}
	});

	it('findStoryTokenIndexForOffset seeks to later section', () => {
		const parsed = parseSegments(OVERVIEW_EXCERPT);
		const bundle = overviewBundle();
		const processed = bundleToStoryProcessed(bundle);
		if (processed.kind !== 'single_story') {
			throw new Error('expected single_story');
		}

		const networkingOffset = OVERVIEW_EXCERPT.indexOf('## Networking');
		expect(networkingOffset).toBeGreaterThan(0);
		const tokenIndex = findStoryTokenIndexForOffset(
			processed.stream,
			parsed,
			networkingOffset
		);
		const token = processed.stream[tokenIndex];
		expect(token?.kind).toBe('section_break');
		expect(token?.text).toContain('Networking');
	});

	it('strips markdown and HTML from deterministic word tokens', () => {
		const segments: NormalizedSegment[] = [
			{
				index: 0,
				kind: 'paragraph',
				body: 'This is **bold** and *italic*'
			},
			{
				index: 1,
				kind: 'paragraph',
				body: 'See [[Note|Display]] and `code`'
			},
			{
				index: 2,
				kind: 'paragraph',
				body: 'Before <em>emphasis</em> after'
			}
		];

		const words = wordTexts(segmentsToStream(segments));
		expect(words).toContain('bold');
		expect(words).toContain('italic');
		expect(words).toContain('Display');
		expect(words).toContain('code');
		expect(words).toContain('emphasis');
		expect(words.some((w) => w.includes('**'))).toBe(false);
		expect(words.some((w) => w.includes('`'))).toBe(false);
		expect(words.some((w) => w.includes('<'))).toBe(false);
	});
});
