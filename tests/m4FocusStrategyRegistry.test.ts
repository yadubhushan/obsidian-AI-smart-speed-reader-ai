import { describe, expect, it } from 'vitest';
import {
	getFocusStrategy,
	isFocusStrategyLive,
	listFocusStrategies
} from '../src/ui/readerShell/m4/focusStrategies/focusStrategyRegistry';

describe('m4FocusStrategyRegistry', () => {
	it('marks all six strategies as live', () => {
		const ids = [
			'orp',
			'peach-anchor',
			'forward-pull',
			'parafoveal',
			'multi-orp',
			'crowding-shield'
		] as const;
		for (const id of ids) {
			expect(isFocusStrategyLive(id)).toBe(true);
			expect(getFocusStrategy(id).isLive).toBe(true);
		}
	});

	it('returns six strategies', () => {
		expect(listFocusStrategies()).toHaveLength(6);
	});

	it('falls back to orp for unknown id via getFocusStrategy', () => {
		expect(getFocusStrategy('orp').id).toBe('orp');
	});
});
