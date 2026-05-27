import { describe, expect, it } from 'vitest';
import { buildCrowdingShieldFocusBlock } from '../src/ui/readerShell/m4/focusStrategies/crowdingShieldStrategy';
import { buildForwardPullFocusBlock } from '../src/ui/readerShell/m4/focusStrategies/forwardPullStrategy';
import { buildMultiOrpFocusBlock } from '../src/ui/readerShell/m4/focusStrategies/multiOrpStrategy';
import { buildParafovealFocusBlock } from '../src/ui/readerShell/m4/focusStrategies/parafovealStrategy';
import { buildPeachAnchorFocusBlock } from '../src/ui/readerShell/m4/focusStrategies/peachAnchorStrategy';
import { renderFocusBlock } from '../src/ui/readerShell/m4/focusStrategies/focusStrategyRegistry';

const sampleWords = [
	{ raw: 'a', word: 'The', punctuation: '', orpIndex: 1, start: 0, end: 3 },
	{ raw: 'b', word: 'quick', punctuation: '', orpIndex: 2, start: 4, end: 9 },
	{ raw: 'c', word: 'fox', punctuation: '.', orpIndex: 1, start: 10, end: 13 }
];

describe('m4ChunkLayout', () => {
	it('peach-anchor highlights last word in 3w chunk', () => {
		const block = buildPeachAnchorFocusBlock({
			words: sampleWords,
			chunkSize: 3,
			focusStrategy: 'peach-anchor'
		});
		const anchors = block.segments.filter((s) => s.kind === 'anchor');
		expect(anchors).toHaveLength(1);
		expect(anchors[0]?.text).toBe('fox.');
	});

	it('peach-anchor 2w chunk anchors second word', () => {
		const block = buildPeachAnchorFocusBlock({
			words: sampleWords.slice(0, 2),
			chunkSize: 2,
			focusStrategy: 'peach-anchor'
		});
		const anchors = block.segments.filter((s) => s.kind === 'anchor');
		expect(anchors[0]?.text).toBe('quick');
	});

	it('forward-pull accents final word in 2w chunk', () => {
		const block = buildForwardPullFocusBlock({
			words: sampleWords.slice(0, 2),
			chunkSize: 2,
			focusStrategy: 'forward-pull'
		});
		expect(block.isLive).toBe(true);
		expect(block.segments.filter((s) => s.kind === 'gradient-accent').map((s) => s.text).join('')).toBe(
			'quick'
		);
		expect(block.segments.some((s) => s.kind === 'forward-lead')).toBe(true);
	});

	it('parafoveal applies weak/core/mid roles in 3w chunk', () => {
		const block = buildParafovealFocusBlock({
			words: sampleWords,
			chunkSize: 3,
			focusStrategy: 'parafoveal'
		});
		expect(block.isLive).toBe(true);
		expect(block.segments.map((s) => s.kind)).toContain('para-weak');
		expect(block.segments.map((s) => s.kind)).toContain('para-core');
		expect(block.segments.map((s) => s.kind)).toContain('para-mid');
	});

	it('multi-orp highlights ORP on each word with focus on last', () => {
		const block = buildMultiOrpFocusBlock({
			words: sampleWords.slice(0, 2),
			chunkSize: 2,
			focusStrategy: 'multi-orp'
		});
		expect(block.isLive).toBe(true);
		expect(block.segments.some((s) => s.kind === 'orp-dim-char')).toBe(true);
		expect(block.segments.some((s) => s.kind === 'orp-focus-char')).toBe(true);
		expect(block.segments.some((s) => s.kind === 'muted')).toBe(false);
	});

	it('crowding-shield fades flanks in 3w chunk', () => {
		const block = buildCrowdingShieldFocusBlock({
			words: sampleWords,
			chunkSize: 3,
			focusStrategy: 'crowding-shield'
		});
		expect(block.isLive).toBe(true);
		expect(block.segments.filter((s) => s.kind === 'crowding-edge')).toHaveLength(2);
		expect(block.segments.filter((s) => s.kind === 'crowding-core')).toHaveLength(1);
	});

	it('renderFocusBlock returns live output for all strategies', () => {
		const strategies = [
			'orp',
			'peach-anchor',
			'forward-pull',
			'parafoveal',
			'multi-orp',
			'crowding-shield'
		] as const;
		for (const focusStrategy of strategies) {
			const block = renderFocusBlock({
				words: sampleWords.slice(0, 2),
				chunkSize: 2,
				focusStrategy
			});
			expect(block.isLive).toBe(true);
			expect(block.segments.some((s) => s.kind === 'muted')).toBe(false);
		}
	});
});
