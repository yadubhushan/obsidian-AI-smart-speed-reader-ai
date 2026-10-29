import type { SpeedReaderAiSettings } from '../types';

const MIN_WPM = 50;
const MAX_WPM = 5000;

/** WPM gained per minute of on-screen reading time while below the target. */
export function rampRatePerMinute(settings: SpeedReaderAiSettings): number {
	const { rampStartWpm, rampTargetWpm, rampMinutes } = settings.reader;
	return Math.max(rampTargetWpm - rampStartWpm, 0) / Math.max(rampMinutes, 0.1);
}

/**
 * Speed after `elapsedMs` of reading time. Only time a word was actually on screen
 * counts, so pauses freeze the ramp. Speeds at or above the target are left alone:
 * the ramp never pulls a manually raised speed back down.
 */
export function advanceRampWpm(currentWpm: number, elapsedMs: number, settings: SpeedReaderAiSettings): number {
	const target = settings.reader.rampTargetWpm;
	if (currentWpm >= target || elapsedMs <= 0) {
		return currentWpm;
	}
	return Math.min(currentWpm + rampRatePerMinute(settings) * (elapsedMs / 60000), target);
}

export function adjustRampWpm(currentWpm: number, delta: number): number {
	return Math.min(Math.max(currentWpm + delta, MIN_WPM), MAX_WPM);
}

/**
 * Minutes to read `words` word-equivalents starting at `currentWpm`, with speed
 * climbing linearly (wpm(t) = cur + rate·t) until the target, then holding.
 */
export function rampReadingMinutes(words: number, currentWpm: number, settings: SpeedReaderAiSettings): number {
	if (words <= 0 || currentWpm <= 0) {
		return 0;
	}
	const target = settings.reader.rampTargetWpm;
	const rate = rampRatePerMinute(settings);
	if (currentWpm >= target || rate <= 0) {
		return words / currentWpm;
	}

	const rampMinutes = (target - currentWpm) / rate;
	const rampWords = ((currentWpm + target) / 2) * rampMinutes;
	if (words <= rampWords) {
		// Solve rate·t²/2 + cur·t = words for t.
		return (-currentWpm + Math.sqrt(currentWpm * currentWpm + 2 * rate * words)) / rate;
	}
	return rampMinutes + (words - rampWords) / target;
}
