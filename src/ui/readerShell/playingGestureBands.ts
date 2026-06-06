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
export const SPEED_LABEL_HIDE_MS = 2000;
export type TopBannerKind = 'wpm' | 'milestone';

export type PlayingZone =
	| 'top'
	| 'middleLeft'
	| 'middleCenter'
	| 'middleRight'
	| 'bottom';

export interface BandLayout {
	scrubLeft: { top: number; left: number; width: number; height: number };
	scrubRight: { top: number; left: number; width: number; height: number };
	centerTop: { top: number; left: number; width: number; height: number };
	centerMiddle: { top: number; left: number; width: number; height: number };
	centerBottom: { top: number; left: number; width: number; height: number };
}

export interface PlayingGestureBandsCallbacks {
	onTapPlayPause: () => void;
	onWpmDelta: (delta: number) => void;
	isBlocked: () => boolean;
}

export interface PlayingGestureBandsHandle {
	destroy(): void;
	setActive(active: boolean): void;
	updateLayout(): void;
	showSpeedLabel(wpm: number): void;
	showBannerMessage(message: string, kind?: TopBannerKind): void;
}

interface TopBannerMessage {
	kind: TopBannerKind;
	text: string;
}

interface TopBannerControllerDeps {
	render: (message: TopBannerMessage | null) => void;
	scheduleHide: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
	clearHide: (timer: ReturnType<typeof setTimeout>) => void;
	hideMs?: number;
}

export interface TopBannerController {
	clear(): void;
	showMessage(text: string, kind?: TopBannerKind): void;
	showSpeedLabel(wpm: number): void;
}

export function createTopBannerController(deps: TopBannerControllerDeps): TopBannerController {
	const hideMs = deps.hideMs ?? SPEED_LABEL_HIDE_MS;
	let current: TopBannerMessage | null = null;
	let hideTimer: ReturnType<typeof setTimeout> | null = null;
	const queue: TopBannerMessage[] = [];

	const clearHideTimer = () => {
		if (hideTimer !== null) {
			deps.clearHide(hideTimer);
			hideTimer = null;
		}
	};

	const showNow = (message: TopBannerMessage) => {
		current = message;
		deps.render(message);
		clearHideTimer();
		hideTimer = deps.scheduleHide(() => {
			current = null;
			deps.render(null);
			const next = queue.shift();
			if (next) {
				showNow(next);
			}
		}, hideMs);
	};

	return {
		clear() {
			clearHideTimer();
			current = null;
			queue.length = 0;
			deps.render(null);
		},
		showMessage(text: string, kind: TopBannerKind = 'milestone') {
			const nextMessage: TopBannerMessage = { text, kind };
			if (!current) {
				showNow(nextMessage);
				return;
			}

			if (kind === 'wpm') {
				if (current.kind === 'milestone') {
					queue.unshift(current);
				}
				showNow(nextMessage);
				return;
			}

			queue.push(nextMessage);
		},
		showSpeedLabel(wpm: number) {
			this.showMessage(`${Math.round(wpm)} WPM`, 'wpm');
		}
	};
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
	const centerLeft = leftWidth;
	const centerWidth = viewport.width * 0.4;
	const rightLeft = leftWidth + centerWidth;
	const rightWidth = viewport.width * 0.3;

	return {
		scrubLeft: { top: 0, left: 0, width: leftWidth, height: viewport.height },
		scrubRight: { top: 0, left: rightLeft, width: rightWidth, height: viewport.height },
		centerTop: { top: 0, left: centerLeft, width: centerWidth, height: topHeight },
		centerMiddle: {
			top: middle.top,
			left: centerLeft,
			width: centerWidth,
			height: middle.height
		},
		centerBottom: {
			top: bottomTop,
			left: centerLeft,
			width: centerWidth,
			height: bottomHeight
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
	const viewportRect = {
		left: 0,
		width: viewport.width,
		top: 0,
		height: viewport.height,
		right: viewport.width,
		bottom: viewport.height,
		x: 0,
		y: 0,
		toJSON: () => ({})
	} as DOMRect;

	const lateral = classifyLateralZone(clientX, viewportRect);
	if (lateral === 'left') {
		return 'middleLeft';
	}
	if (lateral === 'right') {
		return 'middleRight';
	}

	const { centerTop, centerMiddle, centerBottom } = layout;
	if (clientY < centerTop.top + centerTop.height) {
		return 'top';
	}
	if (clientY >= centerBottom.top) {
		return 'bottom';
	}
	if (clientY >= centerMiddle.top && clientY <= centerMiddle.top + centerMiddle.height) {
		return 'middleCenter';
	}
	return null;
}

export function getWpmHoldDelay(tickCount: number): number {
	return tickCount >= WPM_HOLD_ACCELERATE_AFTER_TICKS
		? WPM_HOLD_TICK_FAST_MS
		: WPM_HOLD_TICK_SLOW_MS;
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
	overlayHost: HTMLElement,
	wordDisplayEl: HTMLElement,
	getFontSize: () => number,
	callbacks: PlayingGestureBandsCallbacks
): PlayingGestureBandsHandle {
	const overlay = overlayHost.createDiv({ cls: 'speed-reader-ai-playing-gesture-overlay' });
	const topBanner = overlay.createDiv({ cls: 'speed-reader-ai-playing-top-banner' });
	const hitTop = overlay.createDiv({ cls: 'speed-reader-ai-playing-hit speed-reader-ai-playing-hit-top' });
	const hitCenter = overlay.createDiv({
		cls: 'speed-reader-ai-playing-hit speed-reader-ai-playing-hit-center'
	});
	const hitBottom = overlay.createDiv({
		cls: 'speed-reader-ai-playing-hit speed-reader-ai-playing-hit-bottom'
	});

	let active = false;
	let repeatTimer: ReturnType<typeof setTimeout> | null = null;
	let repeatTickCount = 0;
	let repeatMode: 'wpmUp' | 'wpmDown' | null = null;

	const cleanups: Array<() => void> = [];
	const topBannerController = createTopBannerController({
		render: (message) => {
			if (!message) {
				topBanner.setText('');
				topBanner.removeClass('is-visible');
				topBanner.removeClass('is-wpm');
				topBanner.removeClass('is-milestone');
				return;
			}
			topBanner.setText(message.text);
			topBanner.toggleClass('is-wpm', message.kind === 'wpm');
			topBanner.toggleClass('is-milestone', message.kind === 'milestone');
			topBanner.addClass('is-visible');
		},
		scheduleHide: (callback, delayMs) => setTimeout(callback, delayMs),
		clearHide: (timer) => clearTimeout(timer)
	});

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
		}

		repeatTimer = setTimeout(runRepeatTick, getWpmHoldDelay(repeatTickCount));
	};

	const startRepeat = (mode: 'wpmUp' | 'wpmDown') => {
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

		applyRect(hitTop, layout.centerTop);
		applyRect(hitCenter, layout.centerMiddle);
		applyRect(hitBottom, layout.centerBottom);
	};

	const setActive = (value: boolean) => {
		active = value;
		overlay.toggleClass('is-active', value);
		if (!value) {
			stopRepeat();
			topBannerController.clear();
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
		repeatMode: 'wpmUp' | 'wpmDown' | null;
	}

	const attachZone = (
		el: HTMLElement,
		options: {
			tap?: () => void;
			repeatMode?: PointerState['repeatMode'];
		}
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
			}
			state = null;
		};

		const releaseCapture = (pointerId: number) => {
			if (el.hasPointerCapture(pointerId)) {
				el.releasePointerCapture(pointerId);
			}
		};

		const finishHold = (saved: PointerState) => {
			if (saved.longPressFired) {
				stopRepeat();
			}
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
			if (exceedsTapMovement(dx, dy) && !state.longPressFired) {
				clearLongPress(state);
			}
		};

		const onPointerUp = (event: PointerEvent) => {
			if (state === null || event.pointerId !== state.pointerId) {
				return;
			}
			const saved = state;
			reset();
			releaseCapture(event.pointerId);

			if (!active || callbacks.isBlocked()) {
				return;
			}

			if (saved.longPressFired) {
				finishHold(saved);
				return;
			}

			const dx = event.clientX - saved.startX;
			const dy = event.clientY - saved.startY;
			const elapsed = Date.now() - saved.startTime;
			if (options.tap && !exceedsTapMovement(dx, dy) && elapsed <= TAP_MAX_MS) {
				options.tap();
			}
		};

		const onPointerCancel = (event: PointerEvent) => {
			if (state === null || event.pointerId !== state.pointerId) {
				return;
			}
			const saved = state;
			reset();
			releaseCapture(event.pointerId);
			finishHold(saved);
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

	attachZone(hitTop, { repeatMode: 'wpmUp' });
	attachZone(hitCenter, {
		tap: () => callbacks.onTapPlayPause()
	});
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
			topBannerController.clear();
			for (const cleanup of cleanups) {
				cleanup();
			}
			overlay.remove();
		},
		setActive,
		updateLayout,
		showSpeedLabel: (wpm: number) => topBannerController.showSpeedLabel(wpm),
		showBannerMessage: (message: string, kind: TopBannerKind = 'milestone') =>
			topBannerController.showMessage(message, kind)
	};
}
