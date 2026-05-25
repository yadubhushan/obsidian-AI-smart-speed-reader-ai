import { isSwipeBack } from './mobileGestures';

export interface MobileSwipeBackOptions {
	shouldIgnoreTarget?: (target: EventTarget | null) => boolean;
}

export function mountMobileSwipeBack(
	scrollEl: HTMLElement,
	onSwipeBack: () => void,
	options: MobileSwipeBackOptions = {}
): () => void {
	const shouldIgnore = options.shouldIgnoreTarget ?? (() => false);

	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let startTime = 0;

	const resetPointer = () => {
		pointerId = null;
	};

	const onPointerDown = (event: PointerEvent) => {
		if (event.pointerType === 'mouse' && event.button !== 0) {
			return;
		}
		if (shouldIgnore(event.target)) {
			return;
		}
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		startTime = Date.now();
	};

	const onPointerUp = (event: PointerEvent) => {
		if (pointerId === null || event.pointerId !== pointerId) {
			return;
		}
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		const elapsed = Date.now() - startTime;
		resetPointer();
		if (isSwipeBack(dx, dy, elapsed)) {
			onSwipeBack();
		}
	};

	const onPointerCancel = (event: PointerEvent) => {
		if (event.pointerId === pointerId) {
			resetPointer();
		}
	};

	scrollEl.addEventListener('pointerdown', onPointerDown);
	scrollEl.addEventListener('pointerup', onPointerUp);
	scrollEl.addEventListener('pointercancel', onPointerCancel);

	return () => {
		scrollEl.removeEventListener('pointerdown', onPointerDown);
		scrollEl.removeEventListener('pointerup', onPointerUp);
		scrollEl.removeEventListener('pointercancel', onPointerCancel);
	};
}
