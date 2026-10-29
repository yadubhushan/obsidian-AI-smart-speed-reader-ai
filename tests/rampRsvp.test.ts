/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { advanceRampWpm, rampReadingMinutes } from '../src/engine/rampRsvp';
import { RSVPEngine } from '../src/engine/rsvpEngine';
import { DEFAULT_SETTINGS, type ReaderState, type SpeedReaderAiSettings } from '../src/types';

function rampSettings(): SpeedReaderAiSettings {
	const settings = structuredClone(DEFAULT_SETTINGS);
	settings.reader.enableMicropause = false;
	settings.reader.wpm = 400;
	return settings;
}

describe('rampRsvp math', () => {
	const settings = rampSettings();

	it('climbs 50 → 150 over ten minutes of reading time', () => {
		expect(advanceRampWpm(50, 5 * 60000, settings)).toBeCloseTo(100);
		expect(advanceRampWpm(50, 10 * 60000, settings)).toBe(150);
		expect(advanceRampWpm(50, 30 * 60000, settings)).toBe(150);
	});

	it('leaves a manually raised speed alone', () => {
		expect(advanceRampWpm(220, 60000, settings)).toBe(220);
	});

	it('estimates reading time along the ramp, then at the target', () => {
		// Full ramp reads (50 + 150) / 2 × 10 = 1000 words in 10 minutes.
		expect(rampReadingMinutes(1000, 50, settings)).toBeCloseTo(10);
		expect(rampReadingMinutes(1150, 50, settings)).toBeCloseTo(11);
		expect(rampReadingMinutes(300, 200, settings)).toBeCloseTo(1.5);
	});
});

describe('RSVPEngine ramp-up RSVP', () => {
	let engine: RSVPEngine;
	let states: ReaderState[];
	let settings: SpeedReaderAiSettings;
	const words = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(' ');
	const last = () => states[states.length - 1]!;

	beforeEach(() => {
		vi.useFakeTimers();
		states = [];
		settings = rampSettings();
		engine = new RSVPEngine(settings, (state) => states.push(state), () => undefined);
		engine.setPlaybackMode('rampRsvp');
		engine.loadText(words);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts at 50 WPM, one word at a time, without touching saved WPM', () => {
		engine.play();
		expect(last().currentWpm).toBe(50);
		expect(last().chunk).toHaveLength(1);
		vi.advanceTimersByTime(1200);
		expect(last().currentIndex).toBe(1);
		expect(settings.reader.wpm).toBe(400);
	});

	it('reaches 150 WPM after about ten minutes of playback', () => {
		engine.play();
		vi.advanceTimersByTime(5 * 60000);
		expect(last().currentWpm).toBeGreaterThan(95);
		expect(last().currentWpm).toBeLessThan(101);
		vi.advanceTimersByTime(5 * 60000 + 1000);
		expect(last().currentWpm).toBe(150);
	});

	it('freezes the ramp while paused', () => {
		engine.play();
		vi.advanceTimersByTime(2 * 60000);
		engine.pause();
		const pausedWpm = engine.getCurrentWpm();
		vi.advanceTimersByTime(30 * 60000);
		expect(engine.getCurrentWpm()).toBe(pausedWpm);
		engine.play();
		expect(last().currentWpm).toBe(pausedWpm);
	});

	it('slowing down lengthens the climb; speeding past the target sticks', () => {
		engine.play();
		vi.advanceTimersByTime(5 * 60000);
		engine.adjustWpm(-25);
		vi.advanceTimersByTime(5 * 60000);
		expect(engine.getCurrentWpm()).toBeLessThan(150);

		engine.adjustWpm(100);
		const boosted = engine.getCurrentWpm();
		expect(boosted).toBeGreaterThan(150);
		vi.advanceTimersByTime(60000);
		expect(engine.getCurrentWpm()).toBe(boosted);
		expect(settings.reader.wpm).toBe(400);
	});
});
