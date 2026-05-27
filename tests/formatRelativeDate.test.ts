import { describe, expect, it } from 'vitest';
import { formatRelativeDate } from '../src/history/landing/formatRelativeDate';

describe('formatRelativeDate', () => {
	const now = new Date(2026, 4, 26, 15, 0, 0);

	it('returns Today for same calendar day', () => {
		expect(formatRelativeDate(new Date(2026, 4, 26, 8, 0, 0).toISOString(), now)).toBe('Today');
	});

	it('returns Yesterday for previous day', () => {
		expect(formatRelativeDate(new Date(2026, 4, 25, 20, 0, 0).toISOString(), now)).toBe(
			'Yesterday'
		);
	});

	it('returns N days ago within a week', () => {
		expect(formatRelativeDate(new Date(2026, 4, 24, 20, 0, 0).toISOString(), now)).toBe(
			'2 days ago'
		);
	});

	it('returns short date for older entries', () => {
		const result = formatRelativeDate(new Date(2026, 4, 1, 12, 0, 0).toISOString(), now);
		expect(result).not.toBe('Today');
		expect(result.length).toBeGreaterThan(0);
	});
});
