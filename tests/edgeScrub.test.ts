import { describe, expect, it } from 'vitest';
import {
	getScrubHoldDelay,
	getScrubStepSize,
	SCRUB_RAMP_START_MS,
	SCRUB_RAMP_STEP_INTERVAL_MS
} from '../src/ui/readerShell/edgeScrub';

describe('edgeScrub helpers', () => {
	describe('getScrubStepSize', () => {
		it('skips one word for the first five seconds', () => {
			expect(getScrubStepSize(0)).toBe(1);
			expect(getScrubStepSize(SCRUB_RAMP_START_MS - 1)).toBe(1);
		});

		it('ramps to two words at five seconds then increases over time', () => {
			expect(getScrubStepSize(SCRUB_RAMP_START_MS)).toBe(2);
			expect(getScrubStepSize(SCRUB_RAMP_START_MS + SCRUB_RAMP_STEP_INTERVAL_MS)).toBe(3);
			expect(getScrubStepSize(SCRUB_RAMP_START_MS + SCRUB_RAMP_STEP_INTERVAL_MS * 2)).toBe(4);
		});
	});

	describe('getScrubHoldDelay', () => {
		it('accelerates tick rate during the initial hold', () => {
			expect(getScrubHoldDelay(1)).toBe(150);
			expect(getScrubHoldDelay(3)).toBe(100);
			expect(getScrubHoldDelay(6)).toBe(50);
		});

		it('speeds up further after the ramp start time', () => {
			expect(getScrubHoldDelay(6, SCRUB_RAMP_START_MS)).toBe(50);
			expect(getScrubHoldDelay(6, SCRUB_RAMP_START_MS + SCRUB_RAMP_STEP_INTERVAL_MS)).toBe(42);
		});
	});
});
