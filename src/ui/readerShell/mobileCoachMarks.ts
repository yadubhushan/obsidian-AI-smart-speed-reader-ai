export const MOBILE_COACH_MARKS_KEY = 'speed-reader-ai-mobile-coach-v1';

const COACH_STEPS = [
	'Tap center to play or pause',
	'Double-tap sides to skip',
	'Hold word for definition · Hold subtitle to bookmark'
];

export interface MobileCoachMarksHandle {
	isOpen(): boolean;
	destroy(): void;
}

export function shouldShowCoachMarks(storage: Storage = localStorage): boolean {
	try {
		return storage.getItem(MOBILE_COACH_MARKS_KEY) !== '1';
	} catch {
		return false;
	}
}

export function markCoachMarksComplete(storage: Storage = localStorage): void {
	try {
		storage.setItem(MOBILE_COACH_MARKS_KEY, '1');
	} catch {
		// ignore storage failures
	}
}

export function mountMobileCoachMarks(
	shellEl: HTMLElement,
	onOpenChange?: (open: boolean) => void
): MobileCoachMarksHandle | null {
	if (!shouldShowCoachMarks()) {
		return null;
	}

	const root = shellEl.createDiv({ cls: 'speed-reader-ai-mobile-coach-root' });
	const backdrop = root.createDiv({ cls: 'speed-reader-ai-mobile-coach-backdrop' });
	const card = root.createDiv({ cls: 'speed-reader-ai-mobile-coach-card' });
	const stepIndicator = card.createDiv({ cls: 'speed-reader-ai-mobile-coach-step' });
	const messageEl = card.createDiv({ cls: 'speed-reader-ai-mobile-coach-message' });
	const hintEl = card.createDiv({
		cls: 'speed-reader-ai-mobile-coach-hint',
		text: 'Tap to continue'
	});

	let step = 0;
	let open = true;
	let destroyed = false;

	const notifyOpenChange = () => {
		onOpenChange?.(open);
	};

	const renderStep = () => {
		stepIndicator.setText(`${step + 1} / ${COACH_STEPS.length}`);
		messageEl.setText(COACH_STEPS[step] ?? '');
	};

	const dismiss = () => {
		if (destroyed) {
			return;
		}
		destroyed = true;
		open = false;
		markCoachMarksComplete();
		notifyOpenChange();
		root.remove();
	};

	const advance = () => {
		if (destroyed) {
			return;
		}
		if (step >= COACH_STEPS.length - 1) {
			dismiss();
			return;
		}
		step += 1;
		renderStep();
	};

	const onDismissPointer = (event: PointerEvent) => {
		event.preventDefault();
		event.stopPropagation();
		advance();
	};

	renderStep();
	notifyOpenChange();

	backdrop.addEventListener('pointerdown', onDismissPointer);
	card.addEventListener('pointerdown', onDismissPointer);

	return {
		isOpen() {
			return open;
		},
		destroy() {
			if (!destroyed) {
				root.remove();
				destroyed = true;
				open = false;
				notifyOpenChange();
			}
		}
	};
}
