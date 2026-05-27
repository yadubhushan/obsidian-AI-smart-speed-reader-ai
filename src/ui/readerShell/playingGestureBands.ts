import { classifyLateralZone } from './mobileGestures';

export const LONG_PRESS_MS = 500;
export const TAP_MAX_MOVE_PX = 12;
export const TAP_MAX_MS = 320;
export const MIN_BAND_PAD_PX = 16;
export const BAND_PAD_FONT_RATIO = 0.35;
export const WPM_HOLD_TICK_SLOW_MS = 250;
export const WPM_HOLD_TICK_FAST_MS = 120;
export const WPM_HOLD_ACCELERATE_AFTER_TICKS = 5;
export const WPM_HOLD_DELTA = 5;
export const SPEED_LABEL_HIDE_MS = 1200;

export type PlayingZone =
	| 'top'
	| 'middleLeft'
	| 'middleCenter'
	| 'middleRight'
	| 'bottom';

export interface BandLayout {
	top: { top: number; left: number; width: number; height: number };
	middle: { top: number; left: number; width: number; height: number };
	bottom: { top: number; left: number; width: number; height: number };
	middleLeft: { top: number; left: number; width: number; height: number };
	middleCenter: { top: number; left: number; width: number; height: number };
	middleRight: { top: number; left: number; width: number; height: number };
}

export interface PlayingGestureBandsCallbacks {
	onTapPlayPause: () => void;
	onScrubLeft: () => void;
	onScrubRight: () => void;
	onWpmDelta: (delta: number) => void;
	isBlocked: () => boolean;
}

export interface PlayingGestureBandsHandle {
	destroy(): void;
	setActive(active: boolean): void;
	updateLayout(): void;
	showSpeedLabel(wpm: number): void;
}

export function computeBandPad(fontSize: number): number {
	return Math.max(MIN_BAND_PAD_PX, Math.round(fontSize * BAND_PAD_FONT_RATIO));
}

export function resolveWordStripRect(wordDisplayEl: HTMLElement): DOMRect {
	const inner =
		wordDisplayEl.querySelector('.speed-reader-ai-word') ??
		wordDisplayEl.querySelector('.speed-reader-ai-line-text') ??
		wordDisplayEl.querySelector('.speed-reader-ai-token-display') ??
		wordDisplayEl.firstElementChild;
	const target = inner instanceof HTMLElement ? inner : wordDisplayEl;
	const rect = target.getBoundingClientRect();
	if (rect.width > 0 && rect.height > 0) {
		return rect;
	}
	return wordDisplayEl.getBoundingClientRect();
}

export function computeMiddleBandRect(
	wordRect: DOMRect,
	pad: number,
	viewport: { width: number; height: number }
): { top: number; left: number; width: number; height: number } {
	return {
		top: wordRect.top - pad,
		left: 0,
		width: viewport.width,
		height: wordRect.height + pad * 2
	};
}

export function computeBandLayout(
	wordRect: DOMRect,
	pad: number,
	viewport: { width: number; height: number }
): BandLayout {
	const middle = computeMiddleBandRect(wordRect, pad, viewport);
	const middleBottom = middle.top + middle.height;
	const topHeight = Math.max(0, middle.top);
	const bottomTop = middleBottom;
	const bottomHeight = Math.max(0, viewport.height - bottomTop);

	const leftWidth = viewport.width * 0.3;
	const centerWidth = viewport.width * 0.4;
	const rightWidth = viewport.width * 0.3;

	return {
		top: { top: 0, left: 0, width: viewport.width, height: topHeight },
		middle,
		bottom: { top: bottomTop, left: 0, width: viewport.width, height: bottomHeight },
		middleLeft: {
			top: middle.top,
			left: 0,
			width: leftWidth,
			height: middle.height
		},
		middleCenter: {
			top: middle.top,
			left: leftWidth,
			width: centerWidth,
			height: middle.height
		},
		middleRight: {
			top: middle.top,
			left: leftWidth + centerWidth,
			width: rightWidth,
			height: middle.height
		}
	};
}

export function classifyPlayingZone(
	clientX: number,
	clientY: number,
	wordRect: DOMRect,
	pad: number,
	viewport: { width: number; height: number }
): PlayingZone | null {
	const layout = computeBandLayout(wordRect, pad, viewport);
	const { top, middle, bottom } = layout;

	if (clientY < top.top + top.height) {
		return 'top';
	}
	if (clientY >= bottom.top) {
		return 'bottom';
	}
	if (clientY < middle.top || clientY > middle.top + middle.height) {
		return null;
	}

	const lateral = classifyLateralZone(clientX, {
		left: 0,
		width: viewport.width,
		top: 0,
		height: viewport.height,
		right: viewport.width,
		bottom: viewport.height,
		x: 0,
		y: 0,
		toJSON: () => ({})
	} as DOMRect);

	if (lateral === 'left') {
		return 'middleLeft';
	}
	if (lateral === 'right') {
		return 'middleRight';
	}
	return 'middleCenter';
}

export function getWpmHoldDelay(tickCount: number): number {
	return tickCount >= WPM_HOLD_ACCELERATE_AFTER_TICKS
		? WPM_HOLD_TICK_FAST_MS
		: WPM_HOLD_TICK_SLOW_MS;
}

export function getScrubHoldDelay(tickCount: number): number {
	if (tickCount <= 2) {
		return 150;
	}
	if (tickCount <= 5) {
		return 100;
	}
	return 50;
}

function applyRect(el: HTMLElement, rect: { top: number; left: number; width: number; height: number }) {
	el.style.top = `${rect.top}px`;
	el.style.left = `${rect.left}px`;
	el.style.width = `${rect.width}px`;
	el.style.height = `${rect.height}px`;
}

function exceedsTapMovement(dx: number, dy: number): boolean {
	return Math.abs(dx) > TAP_MAX_MOVE_PX || Math.abs(dy) > TAP_MAX_MOVE_PX;
}

export function mountPlayingGestureBands(
	shellEl: HTMLElement,
	wordDisplayEl: HTMLElement,
	getFontSize: () => number,
	callbacks: PlayingGestureBandsCallbacks
): PlayingGestureBandsHandle {
	const overlay = shellEl.createDiv({ cls: 'speed-reader-ai-playing-gesture-overlay' });
	const hitTop = overlay.createDiv({ cls: 'speed-reader-ai-playing-hit speed-reader-ai-playing-hit-top' });
	const hitStrip = overlay.createDiv({ cls: 'speed-reader-ai-playing-hit-strip' });
	const hitLeft = hitStrip.createDiv({ cls: 'speed-reader-ai-playing-hit speed-reader-ai-playing-hit-left' });
	const hitCenter = hitStrip.createDiv({
		cls: 'speed-reader-ai-playing-hit speed-reader-ai-playing-hit-center'
	});
	const hitRight = hitStrip.createDiv({ cls: 'speed-reader-ai-playing-hit speed-reader-ai-playing-hit-right' });
	const hitBottom = overlay.createDiv({
		cls: 'speed-reader-ai-playing-hit speed-reader-ai-playing-hit-bottom'
	});
	const speedLabel = overlay.createDiv({ cls: 'speed-reader-ai-playing-speed-label' });

	let active = false;
	let speedLabelTimer: ReturnType<typeof setTimeout> | null = null;
	let repeatTimer: ReturnType<typeof setTimeout> | null = null;
	let repeatTickCount = 0;
	let repeatMode: 'wpmUp' | 'wpmDown' | 'scrubLeft' | 'scrubRight' | null = null;

	const cleanups: Array<() => void> = [];

	const clearSpeedLabelTimer = () => {
		if (speedLabelTimer !== null) {
			clearTimeout(speedLabelTimer);
			speedLabelTimer = null;
		}
	};

	const hideSpeedLabel = () => {
		clearSpeedLabelTimer();
		speedLabel.removeClass('is-visible');
	};

	const showSpeedLabel = (wpm: number) => {
		speedLabel.setText(`${Math.round(wpm)} WPM`);
		speedLabel.addClass('is-visible');
		clearSpeedLabelTimer();
		speedLabelTimer = setTimeout(() => hideSpeedLabel(), SPEED_LABEL_HIDE_MS);
	};

	const stopRepeat = () => {
		if (repeatTimer !== null) {
			clearTimeout(repeatTimer);
			repeatTimer = null;
		}
		repeatMode = null;
		repeatTickCount = 0;
	};

	const runRepeatTick = () => {
		if (repeatMode === null) {
			return;
		}
		repeatTickCount += 1;
		if (repeatMode === 'wpmUp') {
			callbacks.onWpmDelta(WPM_HOLD_DELTA);
		} else if (repeatMode === 'wpmDown') {
			callbacks.onWpmDelta(-WPM_HOLD_DELTA);
		} else if (repeatMode === 'scrubLeft') {
			callbacks.onScrubLeft();
		} else if (repeatMode === 'scrubRight') {
			callbacks.onScrubRight();
		}

		const delay =
			repeatMode === 'wpmUp' || repeatMode === 'wpmDown'
				? getWpmHoldDelay(repeatTickCount)
				: getScrubHoldDelay(repeatTickCount);
		repeatTimer = setTimeout(runRepeatTick, delay);
	};

	const startRepeat = (mode: 'wpmUp' | 'wpmDown' | 'scrubLeft' | 'scrubRight') => {
		stopRepeat();
		repeatMode = mode;
		repeatTickCount = 0;
		runRepeatTick();
	};

	const updateLayout = () => {
		const viewport = {
			width: window.innerWidth,
			height: window.innerHeight
		};
		const wordRect = resolveWordStripRect(wordDisplayEl);
		const pad = computeBandPad(getFontSize());
		const layout = computeBandLayout(wordRect, pad, viewport);

		applyRect(hitTop, layout.top);
		applyRect(hitStrip, layout.middle);
		applyRect(hitLeft, layout.middleLeft);
		applyRect(hitCenter, layout.middleCenter);
		applyRect(hitRight, layout.middleRight);
		applyRect(hitBottom, layout.bottom);
	};

	const setActive = (value: boolean) => {
		active = value;
		overlay.toggleClass('is-active', value);
		if (!value) {
			stopRepeat();
			hideSpeedLabel();
		} else {
			updateLayout();
		}
	};

	interface PointerState {
		pointerId: number;
		startX: number;
		startY: number;
		startTime: number;
		longPressFired: boolean;
		longPressTimer: ReturnType<typeof setTimeout> | null;
		repeatMode: 'wpmUp' | 'wpmDown' | 'scrubLeft' | 'scrubRight' | null;
	}

	const attachZone = (
		el: HTMLElement,
		options: { tap?: () => void; repeatMode?: PointerState['repeatMode'] }
	) => {
		let state: PointerState | null = null;

		const clearLongPress = (s: PointerState) => {
			if (s.longPressTimer !== null) {
				clearTimeout(s.longPressTimer);
				s.longPressTimer = null;
			}
		};

		const reset = () => {
			if (state !== null) {
				clearLongPress(state);
				if (state.longPressFired && state.repeatMode !== null) {
					stopRepeat();
				}
			}
			state = null;
		};

		const onPointerDown = (event: PointerEvent) => {
			if (!active || callbacks.isBlocked()) {
				return;
			}
			if (event.pointerType === 'mouse' && event.button !== 0) {
				return;
			}
			event.preventDefault();
			state = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				startTime: Date.now(),
				longPressFired: false,
				longPressTimer: null,
				repeatMode: options.repeatMode ?? null
			};

			if (options.repeatMode) {
				state.longPressTimer = setTimeout(() => {
					if (state === null || state.longPressFired) {
						return;
					}
					state.longPressFired = true;
					startRepeat(options.repeatMode!);
				}, LONG_PRESS_MS);
			}

			el.setPointerCapture(event.pointerId);
		};

		const onPointerMove = (event: PointerEvent) => {
			if (state === null || event.pointerId !== state.pointerId) {
				return;
			}
			const dx = event.clientX - state.startX;
			const dy = event.clientY - state.startY;
			if (exceedsTapMovement(dx, dy)) {
				clearLongPress(state);
				if (state.longPressFired) {
					stopRepeat();
				}
			}
		};

		const onPointerUp = (event: PointerEvent) => {
			if (state === null || event.pointerId !== state.pointerId) {
				return;
			}
			const saved = state;
			reset();
			el.releasePointerCapture(event.pointerId);

			if (!active || callbacks.isBlocked()) {
				return;
			}

			if (saved.longPressFired) {
				stopRepeat();
				return;
			}

			const dx = event.clientX - saved.startX;
			const dy = event.clientY - saved.startY;
			const elapsed = Date.now() - saved.startTime;
			if (
				options.tap &&
				!exceedsTapMovement(dx, dy) &&
				elapsed <= TAP_MAX_MS
			) {
				options.tap();
			}
		};

		const onPointerCancel = (event: PointerEvent) => {
			if (state !== null && event.pointerId === state.pointerId) {
				reset();
			}
		};

		el.addEventListener('pointerdown', onPointerDown);
		el.addEventListener('pointermove', onPointerMove);
		el.addEventListener('pointerup', onPointerUp);
		el.addEventListener('pointercancel', onPointerCancel);
		cleanups.push(() => {
			el.removeEventListener('pointerdown', onPointerDown);
			el.removeEventListener('pointermove', onPointerMove);
			el.removeEventListener('pointerup', onPointerUp);
			el.removeEventListener('pointercancel', onPointerCancel);
		});
	};

	attachZone(hitCenter, {
		tap: () => callbacks.onTapPlayPause()
	});

	attachZone(hitLeft, { repeatMode: 'scrubLeft' });
	attachZone(hitRight, { repeatMode: 'scrubRight' });
	attachZone(hitTop, { repeatMode: 'wpmUp' });
	attachZone(hitBottom, { repeatMode: 'wpmDown' });

	const resizeObserver = new ResizeObserver(() => {
		if (active) {
			updateLayout();
		}
	});
	resizeObserver.observe(wordDisplayEl);
	cleanups.push(() => resizeObserver.disconnect());

	const onWindowResize = () => {
		if (active) {
			updateLayout();
		}
	};
	window.addEventListener('resize', onWindowResize);
	cleanups.push(() => window.removeEventListener('resize', onWindowResize));

	return {
		destroy() {
			stopRepeat();
			hideSpeedLabel();
			for (const cleanup of cleanups) {
				cleanup();
			}
			overlay.remove();
		},
		setActive,
		updateLayout,
		showSpeedLabel
	};
}
