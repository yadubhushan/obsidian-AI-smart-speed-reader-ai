/** Longest a streak may run, however many words the jump crossed. */
export const STREAK_TOTAL_MS = 380;

/** Words are sampled down to this many frames so a long jump stays a flicker. */
export const STREAK_MAX_FRAMES = 10;

/** A frame never gets shorter than this, or nothing registers as text. */
export const STREAK_MIN_FRAME_MS = 30;

export type StreakDirection = 'back' | 'forward';

export interface StreakFrame {
	text: string;
	durationMs: number;
}

export interface StreakPlanOptions {
	maxFrames?: number;
	totalMs?: number;
	minFrameMs?: number;
}

/**
 * Turn the words a jump crossed into the frames to flash.
 *
 * `words` arrives in reading order and includes both endpoints. The landing word
 * is dropped — the reader itself renders that one — and a backward jump plays in
 * reverse, so the text visibly runs the way the reader is travelling.
 */
export function planStreakFrames(
	words: string[],
	direction: StreakDirection,
	options: StreakPlanOptions = {}
): StreakFrame[] {
	const maxFrames = Math.max(1, options.maxFrames ?? STREAK_MAX_FRAMES);
	const totalMs = Math.max(1, options.totalMs ?? STREAK_TOTAL_MS);
	const minFrameMs = Math.max(1, options.minFrameMs ?? STREAK_MIN_FRAME_MS);

	const ordered = direction === 'back' ? [...words].reverse() : [...words];
	// First entry is where the reader already is, last is where it lands: both are
	// on screen anyway, so the streak covers what is passed over in between.
	const passed = ordered.slice(1, -1).filter((word) => word.trim().length > 0);
	if (passed.length === 0) {
		return [];
	}

	const sampled = samplePreservingEnds(passed, maxFrames);
	const durationMs = Math.max(minFrameMs, Math.round(totalMs / sampled.length));
	return sampled.map((text) => ({ text, durationMs }));
}

/** Evenly thin `items` to at most `max` entries, always keeping the first and last. */
function samplePreservingEnds<T>(items: T[], max: number): T[] {
	if (items.length <= max) {
		return items;
	}
	if (max === 1) {
		return [items[0]!];
	}

	const step = (items.length - 1) / (max - 1);
	const result: T[] = [];
	for (let i = 0; i < max; i++) {
		result.push(items[Math.round(i * step)]!);
	}
	return result;
}

export interface NavStreakHandle {
	/** Flash the words crossed by a jump. Words are in reading order. */
	play(words: string[], direction: StreakDirection): void;
	stop(): void;
	destroy(): void;
}

export interface NavStreakDeps {
	schedule(cb: () => void, ms: number): number;
	clear(timer: number): void;
	planOptions?: StreakPlanOptions;
}

/**
 * Words flying past the display in the direction of travel, so a jump reads as
 * movement through the text rather than a teleport.
 */
export function mountNavStreak(
	wordContainer: HTMLElement,
	deps: NavStreakDeps = {
		schedule: (cb, ms) => window.setTimeout(cb, ms),
		clear: (timer) => window.clearTimeout(timer)
	}
): NavStreakHandle {
	let rootEl: HTMLElement | null = null;
	let timer: number | null = null;
	let runId = 0;

	const stop = () => {
		runId += 1;
		if (timer !== null) {
			deps.clear(timer);
			timer = null;
		}
		wordContainer.removeClass('is-nav-streaking');
		rootEl?.remove();
		rootEl = null;
	};

	return {
		play(words: string[], direction: StreakDirection): void {
			const frames = planStreakFrames(words, direction, deps.planOptions);
			stop();
			if (frames.length === 0) {
				return;
			}

			const myRun = runId;
			wordContainer.addClass('is-nav-streaking');
			rootEl = wordContainer.createDiv({
				cls: `speed-reader-ai-nav-streak is-${direction}`
			});

			let index = 0;
			const showNext = () => {
				if (myRun !== runId || !rootEl) {
					return;
				}
				const frame = frames[index];
				if (!frame) {
					stop();
					return;
				}

				rootEl.empty();
				const wordEl = rootEl.createSpan({
					cls: 'speed-reader-ai-nav-streak-word',
					text: frame.text
				});
				wordEl.style.setProperty('--sr-streak-duration', `${frame.durationMs * 2}ms`);

				index += 1;
				timer = deps.schedule(showNext, frame.durationMs);
			};
			showNext();
		},
		stop,
		destroy: stop
	};
}
