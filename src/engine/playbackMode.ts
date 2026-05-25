import type { PlaybackMode } from '../types';

export const PLAYBACK_MODE_ORDER: readonly PlaybackMode[] = [
	'rsvp',
	'progressiveRsvp',
	'lineByLine',
	'lineRepeat'
] as const;

export const PLAYBACK_MODE_LABELS: Record<PlaybackMode, string> = {
	rsvp: 'RSVP',
	progressiveRsvp: 'Progressive RSVP',
	lineByLine: 'Line by line',
	lineRepeat: 'Line repeat'
};

export function isValidPlaybackMode(value: unknown): value is PlaybackMode {
	return typeof value === 'string' && (PLAYBACK_MODE_ORDER as readonly string[]).includes(value);
}

export function normalizePlaybackMode(value: unknown): PlaybackMode {
	if (isValidPlaybackMode(value)) {
		return value;
	}
	return 'rsvp';
}

export function cyclePlaybackMode(current: PlaybackMode): PlaybackMode {
	const index = PLAYBACK_MODE_ORDER.indexOf(current);
	const nextIndex = index === -1 ? 0 : (index + 1) % PLAYBACK_MODE_ORDER.length;
	return PLAYBACK_MODE_ORDER[nextIndex]!;
}

export function getPlaybackModeLabel(mode: PlaybackMode): string {
	return PLAYBACK_MODE_LABELS[mode];
}

/** Validate and return a playback mode, falling back when invalid. */
export function resolvePlaybackMode(value: unknown, fallback: PlaybackMode = 'rsvp'): PlaybackMode {
	return isValidPlaybackMode(value) ? value : fallback;
}

export function isLinePlaybackMode(mode: PlaybackMode): boolean {
	return mode === 'lineByLine' || mode === 'lineRepeat';
}
