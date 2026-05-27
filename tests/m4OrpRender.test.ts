import { describe, expect, it } from 'vitest';
import { splitWordForOrpDisplay } from '../src/services/textParser';
import { buildOrpSingleWordBlock } from '../src/ui/readerShell/m4/focusStrategies/orpStrategy';
import { renderFocusBlock } from '../src/ui/readerShell/m4/focusStrategies/focusStrategyRegistry';

describe('m4OrpRender', () => {
	it('buildOrpSingleWordBlock splits into before/orp/after segments', () => {
		const { before, orp, after } = splitWordForOrpDisplay('reading', 2);
		const block = buildOrpSingleWordBlock({ word: 'reading', punctuation: '', orpIndex: 2 });
		expect(block.segments.map((s) => s.kind)).toEqual(['orp-before', 'orp-char', 'orp-after']);
		expect(block.segments.map((s) => s.text).join('')).toBe(`${before}${orp}${after}`);
	});

	it('renderFocusBlock uses ORP for 1w chunk', () => {
		const block = renderFocusBlock({
			words: [{ raw: 'x', word: 'hello', punctuation: '.', orpIndex: 1, start: 0, end: 5 }],
			chunkSize: 1,
			focusStrategy: 'orp'
		});
		expect(block.isLive).toBe(true);
		expect(block.segments.some((s) => s.kind === 'orp-char')).toBe(true);
	});
});
