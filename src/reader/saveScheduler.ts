import type { ReadingStateStore } from '../types/m2Contracts';

export const DEFAULT_SAVE_DEBOUNCE_MS = 5000;

export interface SaveScheduler {
	scheduleSave(): void;
	flushNow(): Promise<void>;
	destroy(): void;
}

export function createSaveScheduler(
	store: ReadingStateStore,
	debounceMs = DEFAULT_SAVE_DEBOUNCE_MS
): SaveScheduler {
	let timer: ReturnType<typeof setTimeout> | null = null;

	const clearTimer = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	return {
		scheduleSave() {
			clearTimer();
			timer = setTimeout(() => {
				timer = null;
				void store.flush();
			}, debounceMs);
		},

		async flushNow() {
			clearTimer();
			await store.flush();
		},

		destroy() {
			clearTimer();
		}
	};
}
