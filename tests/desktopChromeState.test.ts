import { describe, expect, it } from 'vitest';
import {
	deriveDesktopChromeMode,
	shouldShowInitialReadingSetup
} from '../src/ui/readerShell/desktopChromeState';

describe('adaptive desktop chrome state', () => {
	it('gives transitions priority over setup and playback', () => {
		expect(
			deriveDesktopChromeMode({
				setupRequested: true,
				setupRequired: true,
				isPlaying: true,
				finished: false,
				transitionVisible: true
			})
		).toBe('transition');
	});

	it('shows setup before paused or playing chrome', () => {
		expect(
			deriveDesktopChromeMode({
				setupRequested: false,
				setupRequired: true,
				isPlaying: false,
				finished: false,
				transitionVisible: false
			})
		).toBe('setup');
	});

	it('uses playing only for active unfinished playback', () => {
		expect(
			deriveDesktopChromeMode({
				setupRequested: false,
				setupRequired: false,
				isPlaying: true,
				finished: false,
				transitionVisible: false
			})
		).toBe('playing');
		expect(
			deriveDesktopChromeMode({
				setupRequested: false,
				setupRequired: false,
				isPlaying: true,
				finished: true,
				transitionVisible: false
			})
		).toBe('paused');
	});
});

describe('initial reading setup gate', () => {
	it('does not gate books or legacy readers', () => {
		expect(
			shouldShowInitialReadingSetup({
				isStructured: false,
				hasResumePosition: false,
				activeVersionStatus: 'none',
				hasPreferredAiVersion: false
			})
		).toBe(false);
	});

	it('bypasses setup for resumable and ready sessions', () => {
		expect(
			shouldShowInitialReadingSetup({
				isStructured: true,
				hasResumePosition: true,
				activeVersionStatus: 'none',
				hasPreferredAiVersion: false
			})
		).toBe(false);
		expect(
			shouldShowInitialReadingSetup({
				isStructured: true,
				hasResumePosition: false,
				activeVersionStatus: 'ready',
				hasPreferredAiVersion: true
			})
		).toBe(false);
	});

	it('gates first-time, stale, error, and missing preferred AI sessions', () => {
		for (const input of [
			{ activeVersionStatus: 'none' as const, hasPreferredAiVersion: false },
			{ activeVersionStatus: 'stale' as const, hasPreferredAiVersion: false },
			{ activeVersionStatus: 'error' as const, hasPreferredAiVersion: false },
			{ activeVersionStatus: 'none' as const, hasPreferredAiVersion: true }
		]) {
			expect(
				shouldShowInitialReadingSetup({
					isStructured: true,
					hasResumePosition: false,
					...input
				})
			).toBe(true);
		}
	});
});

