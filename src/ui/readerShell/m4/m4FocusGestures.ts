import {
	classifyLateralZone,
	exceedsTapMovement,
	isSwipeDown,
	isSwipeUp,
	type EdgeSide,
	type LateralZone
} from '../mobileGestures';

const TAP_MAX_MOVE_PX = 12;
const TAP_MAX_MS = 320;
const SWIPE_MIN_PX = 48;
const SWIPE_MAX_MS = 500;
const HOLD_START_MS = 300;

export interface M4FocusGesturesHandle {
	destroy(): void;
	setEnabled(enabled: boolean): void;
}

export interface M4FocusGesturesCallbacks {
	onTapCenter: () => void;
	onHoldStart: (side: EdgeSide) => void;
	onHoldEnd: () => void;
	onSwipeLeft: () => void;
	onSwipeRight: () => void;
	onSwipeUp?: () => void;
	onSwipeDown?: () => void;
	isBlocked: () => boolean;
	isPlaying: () => boolean;
}

function lateralZoneToEdgeSide(zone: LateralZone): EdgeSide | null {
	if (zone === 'left') {
		return 'left';
	}
	if (zone === 'right') {
		return 'right';
	}
	return null;
}

export function mountM4FocusGestures(
	wordContainer: HTMLElement,
	callbacks: M4FocusGesturesCallbacks
): M4FocusGesturesHandle {
	let enabled = true;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let startTime = 0;
	let holdSide: EdgeSide | null = null;
	let holdScrubStarted = false;
	let holdStartTimer: ReturnType<typeof setTimeout> | null = null;

	const isAllowed = () => enabled && !callbacks.isBlocked();

	const clearHoldStartTimer = () => {
		if (holdStartTimer !== null) {
			clearTimeout(holdStartTimer);
			holdStartTimer = null;
		}
	};

	const endHold = () => {
		if (holdScrubStarted) {
			callbacks.onHoldEnd();
		}
		holdSide = null;
		holdScrubStarted = false;
		clearHoldStartTimer();
	};

	const resetPointer = () => {
		endHold();
		pointerId = null;
	};

	const handleVerticalWpmSwipe = (dy: number, dx: number, elapsed: number): boolean => {
		if (!callbacks.isPlaying()) {
			return false;
		}
		if (callbacks.onSwipeUp && isSwipeUp(dy, dx, elapsed)) {
			callbacks.onSwipeUp();
			return true;
		}
		if (callbacks.onSwipeDown && isSwipeDown(dy, dx, elapsed)) {
			callbacks.onSwipeDown();
			return true;
		}
		return false;
	};

	const onPointerDown = (event: PointerEvent) => {
		if (!isAllowed()) {
			return;
		}
		if (event.pointerType === 'mouse' && event.button !== 0) {
			return;
		}

		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		startTime = Date.now();
		holdSide = null;
		holdScrubStarted = false;
		clearHoldStartTimer();

		const rect = wordContainer.getBoundingClientRect();
		const side = lateralZoneToEdgeSide(classifyLateralZone(event.clientX, rect));
		if (side === null) {
			return;
		}

		holdSide = side;
		holdStartTimer = setTimeout(() => {
			holdStartTimer = null;
			if (pointerId === null || holdSide === null) {
				return;
			}
			holdScrubStarted = true;
			callbacks.onHoldStart(holdSide);
		}, HOLD_START_MS);
	};

	const onPointerMove = (event: PointerEvent) => {
		if (pointerId === null || event.pointerId !== pointerId) {
			return;
		}
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (exceedsTapMovement(dx, dy) && holdSide !== null && !holdScrubStarted) {
			endHold();
		}
	};

	const onPointerUp = (event: PointerEvent) => {
		if (pointerId === null || event.pointerId !== pointerId) {
			return;
		}

		const wasHoldScrub = holdScrubStarted;
		const savedStartX = startX;
		const savedStartY = startY;
		const savedStartTime = startTime;
		resetPointer();

		if (!isAllowed()) {
			return;
		}
		if (wasHoldScrub) {
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
			if (dx < 0) {
				callbacks.onSwipeLeft();
			} else {
				callbacks.onSwipeRight();
			}
			return;
		}

		if (absX <= TAP_MAX_MOVE_PX && absY <= TAP_MAX_MOVE_PX && elapsed <= TAP_MAX_MS) {
			const rect = wordContainer.getBoundingClientRect();
			const zone = classifyLateralZone(event.clientX, rect);
			if (zone === 'center') {
				callbacks.onTapCenter();
			}
		}
	};

	const onPointerCancel = (event: PointerEvent) => {
		if (event.pointerId === pointerId) {
			resetPointer();
		}
	};

	wordContainer.addEventListener('pointerdown', onPointerDown);
	wordContainer.addEventListener('pointermove', onPointerMove);
	wordContainer.addEventListener('pointerup', onPointerUp);
	wordContainer.addEventListener('pointercancel', onPointerCancel);

	return {
		destroy() {
			enabled = false;
			resetPointer();
			wordContainer.removeEventListener('pointerdown', onPointerDown);
			wordContainer.removeEventListener('pointermove', onPointerMove);
			wordContainer.removeEventListener('pointerup', onPointerUp);
			wordContainer.removeEventListener('pointercancel', onPointerCancel);
		},
		setEnabled(value) {
			enabled = value;
		}
	};
}
