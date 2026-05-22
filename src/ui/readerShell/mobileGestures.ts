import { wordTextFromContextEvent } from './contextLine';

const TAP_MAX_MOVE_PX = 12;
const TAP_MAX_MS = 320;
const SWIPE_MIN_PX = 48;
const SWIPE_MAX_MS = 500;
const SWIPE_UP_MIN_PX = 40;
const SWIPE_UP_MAX_MS = 400;
const SWIPE_DOWN_MIN_PX = 40;
const SWIPE_DOWN_MAX_MS = 400;
const DOUBLE_TAP_MAX_MS = 300;
const LONG_PRESS_MS = 500;
export const EDGE_ZONE_RATIO = 0.08;
const EDGE_HOLD_START_MS = DOUBLE_TAP_MAX_MS;

export type LateralZone = 'left' | 'center' | 'right';
export type EdgeSide = 'left' | 'right';

export interface MobileGesturesHandle {
	destroy(): void;
	setEnabled(enabled: boolean): void;
}

export interface MobileGesturesCallbacks {
	onTapWordArea: () => void;
	onDoubleTapLeft: () => void;
	onDoubleTapRight: () => void;
	onLongPressWord: () => void;
	onTapContextWord: (word: string) => void;
	onSwipeLeft: () => void;
	onSwipeRight: () => void;
	onSwipeChapterLeft: () => void;
	onSwipeChapterRight: () => void;
	onEdgeHoldStart: (side: EdgeSide) => void;
	onEdgeHoldEnd: () => void;
	onSwipeUp?: () => void;
	onSwipeDown?: () => void;
	isBlocked: () => boolean;
	isHomeActive: () => boolean;
	isPlaying: () => boolean;
}

export function classifyLateralZone(clientX: number, rect: DOMRect): LateralZone {
	const relativeX = clientX - rect.left;
	const width = rect.width;
	if (width <= 0) {
		return 'center';
	}
	const ratio = relativeX / width;
	if (ratio < 0.3) {
		return 'left';
	}
	if (ratio > 0.7) {
		return 'right';
	}
	return 'center';
}

export function isEdgeZone(
	clientX: number,
	rect: DOMRect,
	ratio = EDGE_ZONE_RATIO
): EdgeSide | null {
	const relativeX = clientX - rect.left;
	const width = rect.width;
	if (width <= 0) {
		return null;
	}
	const relativeRatio = relativeX / width;
	if (relativeRatio <= ratio) {
		return 'left';
	}
	if (relativeRatio >= 1 - ratio) {
		return 'right';
	}
	return null;
}

export function shouldSuppressContextWordRetap(
	lastWord: string | null,
	lastTapTime: number,
	word: string,
	now: number,
	maxMs = DOUBLE_TAP_MAX_MS
): boolean {
	if (lastWord === null || lastTapTime === 0) {
		return false;
	}
	if (word !== lastWord) {
		return false;
	}
	return now - lastTapTime <= maxMs;
}

export function isDoubleTap(
	lastZone: LateralZone | null,
	lastTapTime: number,
	currentZone: LateralZone,
	now: number,
	maxMs = DOUBLE_TAP_MAX_MS
): boolean {
	if (lastZone === null || lastTapTime === 0) {
		return false;
	}
	if (currentZone !== lastZone) {
		return false;
	}
	if (currentZone === 'center') {
		return false;
	}
	return now - lastTapTime <= maxMs;
}

export function exceedsTapMovement(dx: number, dy: number, maxPx = TAP_MAX_MOVE_PX): boolean {
	return Math.abs(dx) > maxPx || Math.abs(dy) > maxPx;
}

export function isSwipeUp(
	dy: number,
	dx: number,
	elapsed: number,
	minPx = SWIPE_UP_MIN_PX,
	maxMs = SWIPE_UP_MAX_MS
): boolean {
	const absX = Math.abs(dx);
	const absY = Math.abs(dy);
	return dy <= -minPx && absY > absX && elapsed <= maxMs;
}

export function isSwipeDown(
	dy: number,
	dx: number,
	elapsed: number,
	minPx = SWIPE_DOWN_MIN_PX,
	maxMs = SWIPE_DOWN_MAX_MS
): boolean {
	const absX = Math.abs(dx);
	const absY = Math.abs(dy);
	return dy >= minPx && absY > absX && elapsed <= maxMs;
}

export function mountMobileGestures(
	wordContainer: HTMLElement,
	chapterPillEl: HTMLElement | null,
	contextLineEl: HTMLElement | null,
	callbacks: MobileGesturesCallbacks
): MobileGesturesHandle {
	const cleanups: Array<() => void> = [];
	let enabled = true;

	let wordPointerId: number | null = null;
	let wordStartX = 0;
	let wordStartY = 0;
	let wordStartTime = 0;
	let onChapterPill = false;
	let longPressFired = false;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let lastTapZone: LateralZone | null = null;
	let lastTapTime = 0;

	let edgeHoldSide: EdgeSide | null = null;
	let edgeHoldScrubStarted = false;
	let edgeHoldStartTimer: ReturnType<typeof setTimeout> | null = null;

	let contextPointerId: number | null = null;
	let contextStartX = 0;
	let contextStartY = 0;
	let contextStartTime = 0;
	let lastContextWord: string | null = null;
	let lastContextWordTapTime = 0;

	const isGestureAllowed = () =>
		enabled && callbacks.isHomeActive() && !callbacks.isBlocked();

	const clearLongPressTimer = () => {
		if (longPressTimer !== null) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	};

	const clearEdgeHoldStartTimer = () => {
		if (edgeHoldStartTimer !== null) {
			clearTimeout(edgeHoldStartTimer);
			edgeHoldStartTimer = null;
		}
	};

	const endEdgeHold = () => {
		if (edgeHoldScrubStarted) {
			callbacks.onEdgeHoldEnd();
		}
		edgeHoldSide = null;
		edgeHoldScrubStarted = false;
		clearEdgeHoldStartTimer();
	};

	const resetWordPointer = () => {
		endEdgeHold();
		wordPointerId = null;
		longPressFired = false;
		clearLongPressTimer();
	};

	const resetContextPointer = () => {
		contextPointerId = null;
	};

	const handleVerticalWpmSwipe = (dy: number, dx: number, elapsed: number): boolean => {
		if (!callbacks.isPlaying()) {
			return false;
		}
		if (callbacks.onSwipeUp && isSwipeUp(dy, dx, elapsed)) {
			lastTapZone = null;
			lastTapTime = 0;
			callbacks.onSwipeUp();
			return true;
		}
		if (callbacks.onSwipeDown && isSwipeDown(dy, dx, elapsed)) {
			lastTapZone = null;
			lastTapTime = 0;
			callbacks.onSwipeDown();
			return true;
		}
		return false;
	};

	const onWordPointerDown = (event: PointerEvent) => {
		if (!isGestureAllowed()) {
			return;
		}
		if (event.pointerType === 'mouse' && event.button !== 0) {
			return;
		}
		onChapterPill =
			chapterPillEl !== null &&
			!chapterPillEl.hasClass('is-hidden') &&
			(event.target === chapterPillEl || chapterPillEl.contains(event.target as Node));

		wordPointerId = event.pointerId;
		wordStartX = event.clientX;
		wordStartY = event.clientY;
		wordStartTime = Date.now();
		longPressFired = false;
		edgeHoldSide = null;
		edgeHoldScrubStarted = false;
		clearLongPressTimer();
		clearEdgeHoldStartTimer();

		if (onChapterPill) {
			return;
		}

		const rect = wordContainer.getBoundingClientRect();
		const edgeSide = isEdgeZone(event.clientX, rect);
		if (edgeSide !== null) {
			edgeHoldSide = edgeSide;
			edgeHoldStartTimer = setTimeout(() => {
				edgeHoldStartTimer = null;
				if (wordPointerId === null || edgeHoldSide === null) {
					return;
				}
				edgeHoldScrubStarted = true;
				lastTapZone = null;
				lastTapTime = 0;
				clearLongPressTimer();
				callbacks.onEdgeHoldStart(edgeHoldSide);
			}, EDGE_HOLD_START_MS);
			return;
		}

		const zone = classifyLateralZone(event.clientX, rect);
		if (zone === 'center') {
			longPressTimer = setTimeout(() => {
				longPressTimer = null;
				if (wordPointerId === null || longPressFired) {
					return;
				}
				longPressFired = true;
				lastTapZone = null;
				lastTapTime = 0;
				callbacks.onLongPressWord();
			}, LONG_PRESS_MS);
		}
	};

	const onWordPointerMove = (event: PointerEvent) => {
		if (wordPointerId === null || event.pointerId !== wordPointerId) {
			return;
		}
		const dx = event.clientX - wordStartX;
		const dy = event.clientY - wordStartY;
		if (exceedsTapMovement(dx, dy)) {
			clearLongPressTimer();
			if (edgeHoldSide !== null && !edgeHoldScrubStarted) {
				endEdgeHold();
			}
		}
	};

	const onWordPointerUp = (event: PointerEvent) => {
		if (wordPointerId === null || event.pointerId !== wordPointerId) {
			return;
		}
		const wasLongPress = longPressFired;
		const wasOnChapterPill = onChapterPill;
		const wasEdgeHoldScrub = edgeHoldScrubStarted;
		const savedStartX = wordStartX;
		const savedStartY = wordStartY;
		const savedStartTime = wordStartTime;
		resetWordPointer();

		if (!isGestureAllowed()) {
			return;
		}

		if (wasEdgeHoldScrub) {
			return;
		}

		const dx = event.clientX - savedStartX;
		const dy = event.clientY - savedStartY;
		const elapsed = Date.now() - savedStartTime;
		const absX = Math.abs(dx);
		const absY = Math.abs(dy);

		if (handleVerticalWpmSwipe(dy, dx, elapsed)) {
			return;
		}

		if (absX >= SWIPE_MIN_PX && absX > absY && elapsed <= SWIPE_MAX_MS) {
			lastTapZone = null;
			lastTapTime = 0;
			if (wasOnChapterPill) {
				if (dx < 0) {
					callbacks.onSwipeChapterLeft();
				} else {
					callbacks.onSwipeChapterRight();
				}
			} else if (dx < 0) {
				callbacks.onSwipeLeft();
			} else {
				callbacks.onSwipeRight();
			}
			return;
		}

		if (wasLongPress) {
			return;
		}

		if (absX <= TAP_MAX_MOVE_PX && absY <= TAP_MAX_MOVE_PX && elapsed <= TAP_MAX_MS) {
			if (wasOnChapterPill) {
				return;
			}

			const rect = wordContainer.getBoundingClientRect();
			const zone = classifyLateralZone(event.clientX, rect);
			const now = Date.now();

			if (zone === 'center') {
				lastTapZone = null;
				lastTapTime = 0;
				callbacks.onTapWordArea();
				return;
			}

			if (isDoubleTap(lastTapZone, lastTapTime, zone, now)) {
				lastTapZone = null;
				lastTapTime = 0;
				if (zone === 'left') {
					callbacks.onDoubleTapLeft();
				} else {
					callbacks.onDoubleTapRight();
				}
				return;
			}

			lastTapZone = zone;
			lastTapTime = now;
		}
	};

	const onWordPointerCancel = (event: PointerEvent) => {
		if (event.pointerId === wordPointerId) {
			resetWordPointer();
		}
	};

	const onContextPointerDown = (event: PointerEvent) => {
		if (!isGestureAllowed()) {
			return;
		}
		if (event.pointerType === 'mouse' && event.button !== 0) {
			return;
		}
		if (contextLineEl?.hasClass('is-hidden')) {
			return;
		}

		contextPointerId = event.pointerId;
		contextStartX = event.clientX;
		contextStartY = event.clientY;
		contextStartTime = Date.now();
	};

	const onContextPointerUp = (event: PointerEvent) => {
		if (contextPointerId === null || event.pointerId !== contextPointerId) {
			return;
		}
		const savedStartX = contextStartX;
		const savedStartY = contextStartY;
		const savedStartTime = contextStartTime;
		resetContextPointer();

		if (!isGestureAllowed()) {
			return;
		}

		const dx = event.clientX - savedStartX;
		const dy = event.clientY - savedStartY;
		const elapsed = Date.now() - savedStartTime;
		if (
			Math.abs(dx) > TAP_MAX_MOVE_PX ||
			Math.abs(dy) > TAP_MAX_MOVE_PX ||
			elapsed > TAP_MAX_MS
		) {
			return;
		}

		const word = wordTextFromContextEvent(event);
		if (word) {
			event.preventDefault();
			event.stopPropagation();
			const now = Date.now();
			if (shouldSuppressContextWordRetap(lastContextWord, lastContextWordTapTime, word, now)) {
				lastContextWord = null;
				lastContextWordTapTime = 0;
				return;
			}
			lastContextWord = word;
			lastContextWordTapTime = now;
			callbacks.onTapContextWord(word);
		}
	};

	const onContextPointerCancel = (event: PointerEvent) => {
		if (event.pointerId === contextPointerId) {
			resetContextPointer();
		}
	};

	const registerWordTarget = (el: HTMLElement) => {
		el.addEventListener('pointerdown', onWordPointerDown);
		el.addEventListener('pointermove', onWordPointerMove);
		el.addEventListener('pointerup', onWordPointerUp);
		el.addEventListener('pointercancel', onWordPointerCancel);
		cleanups.push(() => {
			el.removeEventListener('pointerdown', onWordPointerDown);
			el.removeEventListener('pointermove', onWordPointerMove);
			el.removeEventListener('pointerup', onWordPointerUp);
			el.removeEventListener('pointercancel', onWordPointerCancel);
		});
	};

	const registerContextTarget = (el: HTMLElement) => {
		el.addEventListener('pointerdown', onContextPointerDown);
		el.addEventListener('pointerup', onContextPointerUp);
		el.addEventListener('pointercancel', onContextPointerCancel);
		cleanups.push(() => {
			el.removeEventListener('pointerdown', onContextPointerDown);
			el.removeEventListener('pointerup', onContextPointerUp);
			el.removeEventListener('pointercancel', onContextPointerCancel);
		});
	};

	registerWordTarget(wordContainer);
	if (chapterPillEl) {
		registerWordTarget(chapterPillEl);
	}
	if (contextLineEl) {
		registerContextTarget(contextLineEl);
	}

	return {
		destroy() {
			enabled = false;
			resetWordPointer();
			resetContextPointer();
			for (const cleanup of cleanups) {
				cleanup();
			}
		},
		setEnabled(value) {
			enabled = value;
		}
	};
}
