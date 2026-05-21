const TAP_MAX_MOVE_PX = 12;
const TAP_MAX_MS = 320;
const SWIPE_MIN_PX = 48;
const SWIPE_MAX_MS = 500;

export interface MobileGesturesHandle {
	destroy(): void;
	setEnabled(enabled: boolean): void;
}

export interface MobileGesturesCallbacks {
	onTapWordArea: () => void;
	onSwipeLeft: () => void;
	onSwipeRight: () => void;
	onSwipeChapterLeft: () => void;
	onSwipeChapterRight: () => void;
	isBlocked: () => boolean;
	isHomeActive: () => boolean;
}

export function mountMobileGestures(
	wordContainer: HTMLElement,
	chapterPillEl: HTMLElement | null,
	callbacks: MobileGesturesCallbacks
): MobileGesturesHandle {
	const cleanups: Array<() => void> = [];
	let enabled = true;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let startTime = 0;
	let onChapterPill = false;

	const onPointerDown = (event: PointerEvent) => {
		if (!enabled || !callbacks.isHomeActive() || callbacks.isBlocked()) {
			return;
		}
		if (event.pointerType === 'mouse' && event.button !== 0) {
			return;
		}
		onChapterPill =
			chapterPillEl !== null &&
			!chapterPillEl.hasClass('is-hidden') &&
			(event.target === chapterPillEl || chapterPillEl.contains(event.target as Node));
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		startTime = Date.now();
	};

	const onPointerUp = (event: PointerEvent) => {
		if (pointerId === null || event.pointerId !== pointerId) {
			return;
		}
		pointerId = null;
		if (!enabled || !callbacks.isHomeActive() || callbacks.isBlocked()) {
			return;
		}

		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		const elapsed = Date.now() - startTime;
		const absX = Math.abs(dx);
		const absY = Math.abs(dy);

		if (absX >= SWIPE_MIN_PX && absX > absY && elapsed <= SWIPE_MAX_MS) {
			if (onChapterPill) {
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

		if (absX <= TAP_MAX_MOVE_PX && absY <= TAP_MAX_MOVE_PX && elapsed <= TAP_MAX_MS) {
			if (onChapterPill) {
				return;
			}
			callbacks.onTapWordArea();
		}
	};

	const onPointerCancel = (event: PointerEvent) => {
		if (event.pointerId === pointerId) {
			pointerId = null;
		}
	};

	const registerTarget = (el: HTMLElement) => {
		el.addEventListener('pointerdown', onPointerDown);
		el.addEventListener('pointerup', onPointerUp);
		el.addEventListener('pointercancel', onPointerCancel);
		cleanups.push(() => {
			el.removeEventListener('pointerdown', onPointerDown);
			el.removeEventListener('pointerup', onPointerUp);
			el.removeEventListener('pointercancel', onPointerCancel);
		});
	};

	registerTarget(wordContainer);
	if (chapterPillEl) {
		registerTarget(chapterPillEl);
	}

	return {
		destroy() {
			enabled = false;
			for (const cleanup of cleanups) {
				cleanup();
			}
		},
		setEnabled(value) {
			enabled = value;
		}
	};
}
