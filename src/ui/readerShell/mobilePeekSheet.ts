import {
	mountMobileReadingControls,
	type MobileReadingControlsHandle
} from './mobileReadingControls';
import type { ReaderState, SpeedReaderAiSettings } from '../../types';

export interface MobilePeekSheetHandle {
	open(): void;
	close(): void;
	isOpen(): boolean;
	onOpenChange(cb: (open: boolean) => void): void;
	refresh(): void;
	destroy(): void;
}

export interface MobilePeekSheetOptions {
	getSettings: () => SpeedReaderAiSettings;
	getState: () => ReaderState | null;
	onWpmChange: (wpm: number) => void;
	onFontChange: (fontSize: number) => void;
	onToggleMode: () => void;
	onDismiss?: () => void;
}

export function mountMobilePeekSheet(
	shellEl: HTMLElement,
	options: MobilePeekSheetOptions
): MobilePeekSheetHandle {
	const root = shellEl.createDiv({ cls: 'speed-reader-ai-mobile-peek-root' });
	const backdrop = root.createDiv({
		cls: 'speed-reader-ai-mobile-sheet-backdrop speed-reader-ai-mobile-peek-backdrop is-hidden'
	});
	const sheet = root.createDiv({
		cls: 'speed-reader-ai-mobile-sheet speed-reader-ai-mobile-peek-sheet is-hidden'
	});
	const title = sheet.createDiv({
		cls: 'speed-reader-ai-mobile-peek-title',
		text: 'Reading'
	});
	const controlsHost = sheet.createDiv({ cls: 'speed-reader-ai-mobile-peek-controls-host' });

	let open = false;
	const openListeners: Array<(open: boolean) => void> = [];
	let readingControls: MobileReadingControlsHandle | null = null;

	const notifyOpenChange = () => {
		for (const listener of openListeners) {
			listener(open);
		}
	};

	const close = () => {
		if (!open) {
			return;
		}
		open = false;
		backdrop.addClass('is-hidden');
		sheet.addClass('is-hidden');
		root.removeClass('is-sheet-open');
		notifyOpenChange();
	};

	const openSheet = () => {
		if (open) {
			return;
		}
		open = true;
		backdrop.removeClass('is-hidden');
		sheet.removeClass('is-hidden');
		root.addClass('is-sheet-open');
		readingControls?.refresh();
		notifyOpenChange();
	};

	readingControls = mountMobileReadingControls(controlsHost, {
		getSettings: options.getSettings,
		getState: options.getState,
		onWpmChange: options.onWpmChange,
		onFontChange: options.onFontChange,
		onToggleMode: options.onToggleMode
	});

	const onBackdropClick = () => {
		close();
		options.onDismiss?.();
	};
	backdrop.addEventListener('click', onBackdropClick);

	// Dismiss when user taps the dimmed reading area above the sheet
	backdrop.addEventListener(
		'pointerdown',
		(event) => {
			if (event.target === backdrop) {
				close();
				options.onDismiss?.();
			}
		},
		{ capture: true }
	);

	return {
		open: openSheet,
		close,
		isOpen: () => open,
		onOpenChange(cb) {
			openListeners.push(cb);
		},
		refresh() {
			readingControls?.refresh();
		},
		destroy() {
			backdrop.removeEventListener('click', onBackdropClick);
			readingControls?.destroy();
			root.remove();
		}
	};
}
