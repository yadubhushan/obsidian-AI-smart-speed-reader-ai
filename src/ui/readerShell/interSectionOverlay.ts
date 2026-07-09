export const INTER_SECTION_MS = 5000;

export interface InterSectionOverlayHandle {
	show(nextLabel: string, nextTitle: string, onContinue: () => void): void;
	isVisible(): boolean;
	/** Stops countdown/auto-advance without firing onContinue (e.g. on close). */
	clearTimers(): void;
	destroy(): void;
}

export function countdownText(seconds: number): string {
	return seconds === 1 ? 'Starting next in 1 second…' : `Starting next in ${seconds} seconds…`;
}

export interface InterSectionCountdownDeps {
	onShow(nextLabel: string, nextTitle: string, countdownSeconds: number): void;
	onCountdownTick(seconds: number): void;
	onHide(): void;
	schedule(cb: () => void, ms: number): number;
	clear(timer: number): void;
	scheduleInterval(cb: () => void, ms: number): number;
	clearInterval(timer: number): void;
	durationMs?: number;
}

/**
 * Countdown state machine for the between-sections pause: shows for
 * `durationMs`, ticks once per second, then auto-continues; a dismiss
 * (button or timeout) continues exactly once.
 */
export function createInterSectionCountdown(deps: InterSectionCountdownDeps) {
	const durationMs = deps.durationMs ?? INTER_SECTION_MS;
	let visible = false;
	let timer: number | null = null;
	let countdownInterval: number | null = null;
	let activeOnContinue: (() => void) | null = null;

	const clearCountdownInterval = () => {
		if (countdownInterval !== null) {
			deps.clearInterval(countdownInterval);
			countdownInterval = null;
		}
	};

	const clearTimers = () => {
		clearCountdownInterval();
		if (timer !== null) {
			deps.clear(timer);
			timer = null;
		}
	};

	const dismiss = () => {
		if (!visible) {
			return;
		}
		clearTimers();
		visible = false;
		deps.onHide();
		const onContinue = activeOnContinue;
		activeOnContinue = null;
		onContinue?.();
	};

	return {
		show(nextLabel: string, nextTitle: string, onContinue: () => void): void {
			clearTimers();
			visible = true;
			activeOnContinue = onContinue;

			const countdownSeconds = Math.round(durationMs / 1000);
			deps.onShow(nextLabel, nextTitle, countdownSeconds);

			let remaining = countdownSeconds;
			countdownInterval = deps.scheduleInterval(() => {
				remaining -= 1;
				if (remaining <= 0) {
					clearCountdownInterval();
					return;
				}
				deps.onCountdownTick(remaining);
			}, 1000);

			timer = deps.schedule(() => {
				dismiss();
			}, durationMs);
		},
		dismiss,
		clearTimers,
		isVisible(): boolean {
			return visible;
		}
	};
}

/** Mounts the inter-section overlay into the word container. */
export function mountInterSectionOverlay(
	wordContainer: HTMLElement,
	durationMs = INTER_SECTION_MS
): InterSectionOverlayHandle {
	const overlayEl = wordContainer.createDiv({
		cls: 'speed-reader-ai-inter-section-overlay is-hidden'
	});
	let countdownEl: HTMLElement | null = null;

	const controller = createInterSectionCountdown({
		onShow: (nextLabel, nextTitle, countdownSeconds) => {
			overlayEl.empty();
			overlayEl.removeClass('is-hidden');
			overlayEl.createSpan({
				cls: 'speed-reader-ai-inter-section-label',
				text: nextLabel
			});
			overlayEl.createSpan({
				cls: 'speed-reader-ai-inter-section-title',
				text: nextTitle
			});
			overlayEl.createSpan({
				cls: 'speed-reader-ai-inter-section-done',
				text: 'Finished'
			});
			countdownEl = overlayEl.createSpan({
				cls: 'speed-reader-ai-inter-section-countdown'
			});
			countdownEl.setText(countdownText(countdownSeconds));
			const skip = overlayEl.createEl('button', {
				cls: 'speed-reader-ai-btn speed-reader-ai-btn-secondary',
				text: 'Continue now'
			});
			skip.addEventListener('click', () => controller.dismiss(), { once: true });
		},
		onCountdownTick: (seconds) => {
			countdownEl?.setText(countdownText(seconds));
		},
		onHide: () => {
			overlayEl.addClass('is-hidden');
		},
		schedule: (cb, ms) => window.setTimeout(cb, ms),
		clear: (timer) => window.clearTimeout(timer),
		scheduleInterval: (cb, ms) => window.setInterval(cb, ms),
		clearInterval: (timer) => window.clearInterval(timer),
		durationMs
	});

	return {
		show: controller.show,
		isVisible: controller.isVisible,
		clearTimers: controller.clearTimers,
		destroy(): void {
			controller.clearTimers();
			overlayEl.remove();
		}
	};
}
