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

export type EdgeScrubSide = 'left' | 'right';

export interface EdgeScrubControllerDeps {
	onStep(side: EdgeScrubSide, count: number): void;
	/** Owns side-effect of marking the held edge (e.g. shell CSS classes); null clears. */
	setHoldSide(side: EdgeScrubSide | null): void;
	schedule(cb: () => void, ms: number): number;
	clear(timer: number): void;
	now(): number;
}

export interface EdgeScrubHandle {
	start(side: EdgeScrubSide): void;
	stop(): void;
	isScrubbing(): boolean;
}

/**
 * Hold-to-scrub loop: steps once per tick, ramping step size and shrinking
 * delay the longer the edge is held (via getScrubStepSize/getScrubHoldDelay).
 */
export function createEdgeScrubController(deps: EdgeScrubControllerDeps): EdgeScrubHandle {
	let holdSide: EdgeScrubSide | null = null;
	let timer: number | null = null;
	let tickCount = 0;
	let startedAt = 0;

	const stop = () => {
		if (timer !== null) {
			deps.clear(timer);
			timer = null;
		}
		holdSide = null;
		tickCount = 0;
		startedAt = 0;
		deps.setHoldSide(null);
	};

	const tick = () => {
		if (holdSide === null) {
			return;
		}
		const elapsedMs = deps.now() - startedAt;
		deps.onStep(holdSide, getScrubStepSize(elapsedMs));
		tickCount += 1;
		timer = deps.schedule(tick, getScrubHoldDelay(tickCount, elapsedMs));
	};

	return {
		start(side: EdgeScrubSide): void {
			stop();
			holdSide = side;
			tickCount = 0;
			startedAt = deps.now();
			deps.setHoldSide(side);
			tick();
		},
		stop,
		isScrubbing(): boolean {
			return holdSide !== null;
		}
	};
}

export const SKIP_FLASH_MS = 300;

export interface SkipFlashHandle {
	flash(side: EdgeScrubSide): void;
	destroy(): void;
}

/** Brief directional ◀/▶ flash over the word display after a double-tap skip. */
export function mountSkipFlash(
	wordContainer: HTMLElement,
	durationMs = SKIP_FLASH_MS
): SkipFlashHandle {
	let flashEl: HTMLElement | null = null;
	let timer: number | null = null;

	const clear = () => {
		if (timer !== null) {
			window.clearTimeout(timer);
			timer = null;
		}
		flashEl?.remove();
		flashEl = null;
	};

	return {
		flash(side: EdgeScrubSide): void {
			clear();
			flashEl = wordContainer.createDiv({
				cls:
					side === 'left'
						? 'speed-reader-ai-mobile-skip-flash speed-reader-ai-mobile-skip-flash-left'
						: 'speed-reader-ai-mobile-skip-flash speed-reader-ai-mobile-skip-flash-right',
				text: side === 'left' ? '◀' : '▶'
			});
			timer = window.setTimeout(clear, durationMs);
		},
		destroy: clear
	};
}
