/** Shared double-tap window (matches mobileGestures.ts). */
export const DOUBLE_TAP_MAX_MS = 300;

export interface TapClassifierCallbacks {
	onSingle: () => void;
	onDouble: () => void;
}

export interface TapClassifierHandle {
	destroy(): void;
}

export function mountTapClassifier(
	button: HTMLElement,
	callbacks: TapClassifierCallbacks
): TapClassifierHandle {
	let lastTapAt = 0;
	let singleTimer: ReturnType<typeof setTimeout> | null = null;

	const clearSingleTimer = () => {
		if (singleTimer !== null) {
			clearTimeout(singleTimer);
			singleTimer = null;
		}
	};

	const onPointerUp = (event: PointerEvent) => {
		if (event.button !== 0) {
			return;
		}
		const now = Date.now();
		const delta = now - lastTapAt;
		lastTapAt = now;

		if (delta > 0 && delta <= DOUBLE_TAP_MAX_MS) {
			clearSingleTimer();
			callbacks.onDouble();
			return;
		}

		clearSingleTimer();
		singleTimer = setTimeout(() => {
			singleTimer = null;
			callbacks.onSingle();
		}, DOUBLE_TAP_MAX_MS);
	};

	button.addEventListener('pointerup', onPointerUp);

	return {
		destroy() {
			clearSingleTimer();
			button.removeEventListener('pointerup', onPointerUp);
		}
	};
}

export function classifyTapSequence(tapsMsApart: number[]): 'single' | 'double' {
	if (tapsMsApart.length < 2) {
		return 'single';
	}
	return tapsMsApart[1]! <= DOUBLE_TAP_MAX_MS ? 'double' : 'single';
}
