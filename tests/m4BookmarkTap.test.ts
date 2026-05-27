import { describe, expect, it } from 'vitest';
import { classifyTapSequence, DOUBLE_TAP_MAX_MS } from '../src/ui/readerShell/m4/m4BookmarkButton';

describe('m4BookmarkTap', () => {
	it('classifies double tap within window', () => {
		expect(classifyTapSequence([0, 150])).toBe('double');
		expect(classifyTapSequence([0, DOUBLE_TAP_MAX_MS])).toBe('double');
	});

	it('classifies slow taps as single', () => {
		expect(classifyTapSequence([0, DOUBLE_TAP_MAX_MS + 1])).toBe('single');
		expect(classifyTapSequence([0])).toBe('single');
	});
});
