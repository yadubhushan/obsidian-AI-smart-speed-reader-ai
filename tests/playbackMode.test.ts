import { describe, it, expect } from 'vitest';
import {
	PLAYBACK_MODE_LABELS,
	PLAYBACK_MODE_ORDER,
	cyclePlaybackMode,
	getPlaybackModeLabel,
	isLinePlaybackMode,
	isValidPlaybackMode,
	normalizePlaybackMode,
	resolvePlaybackMode
} from '../src/engine/playbackMode';

describe('playbackMode helpers', () => {
	it('defines four modes in cycle order', () => {
		expect(PLAYBACK_MODE_ORDER).toEqual(['rsvp', 'progressiveRsvp', 'lineByLine', 'lineRepeat']);
	});

	it('maps display labels', () => {
		expect(PLAYBACK_MODE_LABELS.rsvp).toBe('RSVP');
		expect(PLAYBACK_MODE_LABELS.progressiveRsvp).toBe('Progressive RSVP');
		expect(PLAYBACK_MODE_LABELS.lineByLine).toBe('Line by line');
		expect(PLAYBACK_MODE_LABELS.lineRepeat).toBe('Line repeat');
		expect(getPlaybackModeLabel('lineByLine')).toBe('Line by line');
	});

	it('validates known playback modes', () => {
		expect(isValidPlaybackMode('rsvp')).toBe(true);
		expect(isValidPlaybackMode('progressiveRsvp')).toBe(true);
		expect(isValidPlaybackMode('lineByLine')).toBe(true);
		expect(isValidPlaybackMode('lineRepeat')).toBe(true);
		expect(isValidPlaybackMode('unknown')).toBe(false);
		expect(isValidPlaybackMode(null)).toBe(false);
	});

	it('normalizes unknown values to rsvp', () => {
		expect(normalizePlaybackMode('rsvp')).toBe('rsvp');
		expect(normalizePlaybackMode('lineRepeat')).toBe('lineRepeat');
		expect(normalizePlaybackMode('progressiveRsvp')).toBe('progressiveRsvp');
		expect(normalizePlaybackMode('lineByLine')).toBe('lineByLine');
		expect(normalizePlaybackMode('legacy')).toBe('rsvp');
		expect(normalizePlaybackMode(undefined)).toBe('rsvp');
	});

	it('cycles through all four modes', () => {
		expect(cyclePlaybackMode('rsvp')).toBe('progressiveRsvp');
		expect(cyclePlaybackMode('progressiveRsvp')).toBe('lineByLine');
		expect(cyclePlaybackMode('lineByLine')).toBe('lineRepeat');
		expect(cyclePlaybackMode('lineRepeat')).toBe('rsvp');
	});

	it('resolvePlaybackMode uses fallback for invalid values', () => {
		expect(resolvePlaybackMode('lineRepeat')).toBe('lineRepeat');
		expect(resolvePlaybackMode('bogus', 'lineRepeat')).toBe('lineRepeat');
	});

	it('identifies line navigation modes', () => {
		expect(isLinePlaybackMode('lineByLine')).toBe(true);
		expect(isLinePlaybackMode('lineRepeat')).toBe(true);
		expect(isLinePlaybackMode('rsvp')).toBe(false);
		expect(isLinePlaybackMode('progressiveRsvp')).toBe(false);
	});
});
