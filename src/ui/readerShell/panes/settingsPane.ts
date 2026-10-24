import type { SpeedReaderAiSettings } from '../../../types';
import { MOBILE_ROUTE_LABELS } from '../mobileNavigation';
import { mountMobileStackChrome, type MobileStackChromeHandle } from '../mobileStackChrome';
import {
	buildAppearanceCard,
	buildBehaviorCard,
	buildDisplayCard,
	buildReadingCard,
	buildVoiceCard,
	resetPaneFieldsToDefaults,
	type ReaderSettings,
	type SettingsSection,
	type SettingsSectionContext
} from './settings/sections';

/** Continuous inputs (slider drags, stepper clicks) settle for this long before persisting. */
const LIVE_SAVE_DEBOUNCE_MS = 250;
const RESET_CONFIRM_MS = 3000;

export type SettingsMutation = (settings: SpeedReaderAiSettings) => void;

export interface SettingsPaneHandle {
	destroy(): void;
	refresh(settings: SpeedReaderAiSettings): void;
	onSwipeBack(cb: () => void): void;
}

export function mountSettingsPane(
	container: HTMLElement,
	settings: SpeedReaderAiSettings,
	handlers: {
		/**
		 * Live apply: receives a mutation to run against the latest saved settings, so changes
		 * made elsewhere while the pane is open (WPM keys, TTS toggle) are not overwritten.
		 */
		onChange: (mutate: SettingsMutation) => void;
		isMobile?: boolean;
	}
): SettingsPaneHandle {
	const isMobile = handlers.isMobile ?? false;
	const pane = container.createDiv({ cls: 'speed-reader-ai-pane speed-reader-ai-pane-settings is-hidden' });
	let stackChrome: MobileStackChromeHandle | null = null;
	let bodyHost: HTMLElement = pane;
	if (isMobile) {
		stackChrome = mountMobileStackChrome(pane, {
			title: MOBILE_ROUTE_LABELS.settings,
			scrollEl: pane,
			ignoreSwipeSelectors:
				'.speed-reader-ai-settings-slider, .speed-reader-ai-settings-segmented, .speed-reader-ai-theme-grid'
		});
		bodyHost = pane.createDiv({ cls: 'speed-reader-ai-mobile-stack-body' });
	}

	let draft = structuredClone(settings);
	let sections: SettingsSection[] = [];
	let pending: ((reader: ReaderSettings) => void)[] = [];
	let flushTimer: number | null = null;

	const flush = () => {
		if (flushTimer !== null) {
			window.clearTimeout(flushTimer);
			flushTimer = null;
		}
		if (pending.length === 0) {
			return;
		}
		const batch = pending;
		pending = [];
		handlers.onChange((next) => {
			for (const mutate of batch) {
				mutate(next.reader);
			}
		});
	};

	const syncSections = () => {
		for (const section of sections) {
			section.sync();
		}
	};

	const ctx: SettingsSectionContext = {
		reader: () => draft.reader,
		update(mutate, options) {
			mutate(draft.reader);
			pending.push(mutate);
			syncSections();
			if (options?.debounce) {
				if (flushTimer !== null) {
					window.clearTimeout(flushTimer);
				}
				flushTimer = window.setTimeout(flush, LIVE_SAVE_DEBOUNCE_MS);
			} else {
				flush();
			}
		}
	};

	const destroySections = () => {
		for (const section of sections) {
			section.destroy?.();
		}
		sections = [];
	};

	const buildResetFooter = (parent: HTMLElement) => {
		const footer = parent.createDiv({ cls: 'speed-reader-ai-settings-footer' });
		const resetBtn = footer.createEl('button', {
			cls: 'speed-reader-ai-settings-reset-all',
			text: 'Reset to defaults',
			attr: { type: 'button' }
		});
		let confirmTimer: number | null = null;
		resetBtn.addEventListener('click', () => {
			if (confirmTimer === null) {
				resetBtn.setText('Click again to reset');
				resetBtn.addClass('is-confirming');
				confirmTimer = window.setTimeout(() => {
					confirmTimer = null;
					resetBtn.setText('Reset to defaults');
					resetBtn.removeClass('is-confirming');
				}, RESET_CONFIRM_MS);
				return;
			}
			window.clearTimeout(confirmTimer);
			confirmTimer = null;
			ctx.update(resetPaneFieldsToDefaults);
			render();
		});
	};

	const render = () => {
		destroySections();
		bodyHost.empty();
		const column = bodyHost.createDiv({ cls: 'speed-reader-ai-settings-column' });
		sections = [
			buildReadingCard(column, ctx),
			buildAppearanceCard(column, ctx),
			buildDisplayCard(column, ctx),
			buildBehaviorCard(column, ctx),
			buildVoiceCard(column, ctx)
		];
		buildResetFooter(column);
		syncSections();
	};

	render();

	return {
		destroy() {
			flush();
			destroySections();
			stackChrome?.destroy();
			pane.remove();
		},
		refresh(next) {
			// Re-rendering resets focus and in-progress drags, so only rebuild on a real change.
			if (pending.length > 0 || JSON.stringify(next.reader) === JSON.stringify(draft.reader)) {
				return;
			}
			draft = structuredClone(next);
			render();
		},
		onSwipeBack(cb) {
			stackChrome?.onBack(cb);
		}
	};
}

export function showSettingsPane(paneEl: HTMLElement, visible: boolean): void {
	paneEl.toggleClass('is-hidden', !visible);
}
