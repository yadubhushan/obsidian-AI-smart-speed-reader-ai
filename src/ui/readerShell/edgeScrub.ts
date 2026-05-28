/** Hold scrub stays at 1 word/tick until this elapsed time, then ramps up. */
export const SCRUB_RAMP_START_MS = 5000;

/** After ramp starts, add one word per tick every this many ms. */
export const SCRUB_RAMP_STEP_INTERVAL_MS = 1500;

export const SCRUB_MAX_WORDS_PER_TICK = 15;
export const SCRUB_MIN_DELAY_MS = 30;

export function getScrubStepSize(elapsedMs: number): number {
	if (elapsedMs < SCRUB_RAMP_START_MS) {
		return 1;
	}
	const rampElapsed = elapsedMs - SCRUB_RAMP_START_MS;
	return Math.min(
		SCRUB_MAX_WORDS_PER_TICK,
		2 + Math.floor(rampElapsed / SCRUB_RAMP_STEP_INTERVAL_MS)
	);
}

export function getScrubHoldDelay(tickCount: number, elapsedMs = 0): number {
	let delay = tickCount <= 2 ? 150 : tickCount <= 5 ? 100 : 50;
	if (elapsedMs >= SCRUB_RAMP_START_MS) {
		const rampLevel = Math.floor(
			(elapsedMs - SCRUB_RAMP_START_MS) / SCRUB_RAMP_STEP_INTERVAL_MS
		);
		delay = Math.max(SCRUB_MIN_DELAY_MS, delay - rampLevel * 8);
	}
	return delay;
}
