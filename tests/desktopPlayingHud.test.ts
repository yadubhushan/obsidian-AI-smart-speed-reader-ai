// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
	createPlayingHudVisibilityController,
	isEligibleCanvasPauseTarget,
	PLAYING_HUD_HIDE_DELAY_MS
} from '../src/ui/readerShell/desktopPlayingHud';

describe('desktop playing HUD visibility', () => {
	it('reveals, reschedules, and auto-hides', () => {
		vi.useFakeTimers();
		const states: boolean[] = [];
		const controller = createPlayingHudVisibilityController({
			setRevealed: (revealed) => states.push(revealed),
			schedule: (cb, ms) => window.setTimeout(cb, ms),
			clear: (timer) => window.clearTimeout(timer)
		});

		controller.reveal();
		vi.advanceTimersByTime(PLAYING_HUD_HIDE_DELAY_MS - 100);
		controller.reveal();
		vi.advanceTimersByTime(PLAYING_HUD_HIDE_DELAY_MS);
		expect(states).toEqual([true, true, false]);
		controller.destroy();
		vi.useRealTimers();
	});
});

describe('canvas pause target eligibility', () => {
	it('accepts only empty canvas surfaces', () => {
		const container = document.createElement('div');
		const display = document.createElement('div');
		display.className = 'speed-reader-ai-word-display';
		const word = document.createElement('span');
		const button = document.createElement('button');
		display.append(word, button);
		container.append(display);

		expect(isEligibleCanvasPauseTarget(container, container, '')).toBe(true);
		expect(isEligibleCanvasPauseTarget(display, container, '')).toBe(true);
		expect(isEligibleCanvasPauseTarget(word, container, '')).toBe(false);
		expect(isEligibleCanvasPauseTarget(button, container, '')).toBe(false);
		expect(isEligibleCanvasPauseTarget(display, container, 'selected text')).toBe(false);
	});
});

