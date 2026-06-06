import { describe, expect, it } from 'vitest';
import {
	bodyToStream,
	PARAGRAPH_PAUSE_MS,
	proseToWordTokens
} from '../src/prepare/proseToStream';
import { calculateORP } from '../src/services/textParser';

describe('proseToStream', () => {
	it('proseToWordTokens splits words and assigns ORP', () => {
		const tokens = proseToWordTokens('Hello world');
		expect(tokens).toHaveLength(2);
		expect(tokens[0]).toEqual({
			kind: 'word',
			text: 'Hello',
			orpIndex: calculateORP('Hello')
		});
		expect(tokens[1]).toEqual({
			kind: 'word',
			text: 'world',
			orpIndex: calculateORP('world')
		});
	});

	it('bodyToStream inserts paragraph pauses between paragraphs', () => {
		const stream = bodyToStream('First paragraph.\n\nSecond paragraph.');
		expect(stream.some((t) => t.kind === 'pause' && t.pauseMs === PARAGRAPH_PAUSE_MS)).toBe(
			true
		);
		expect(stream.filter((t) => t.kind === 'word').length).toBeGreaterThan(2);
	});

	it('bodyToStream returns empty array for blank body', () => {
		expect(bodyToStream('   ')).toEqual([]);
	});

	it('bodyToStream handles single paragraph without pause', () => {
		const stream = bodyToStream('One paragraph only.');
		expect(stream.every((t) => t.kind === 'word')).toBe(true);
	});

	it('proseToWordTokens splits glued dialogue tokens', () => {
		const tokens = proseToWordTokens("charming.''That");
		expect(tokens.map((token) => token.text)).toEqual(['charming.', "''That"]);
	});

	it('proseToWordTokens strips numeric footnote markers glued after sentence punctuation', () => {
		const tokens = proseToWordTokens('asphodel.3 She dragged');
		expect(tokens.map((token) => token.text)).toEqual(['asphodel.', 'She', 'dragged']);
	});
});
