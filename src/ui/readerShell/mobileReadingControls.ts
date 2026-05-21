import type { ReaderState, SpeedReaderAiSettings } from '../../types';

const MIN_WPM = 50;
const MAX_WPM = 5000;
const MIN_FONT_SIZE = 24;
const MAX_FONT_SIZE = 200;

export interface MobileReadingControlsHandle {
	destroy(): void;
	refresh(): void;
}

export interface MobileReadingControlsOptions {
	getSettings: () => SpeedReaderAiSettings;
	getState: () => ReaderState | null;
	onWpmChange: (wpm: number) => void;
	onFontChange: (fontSize: number) => void;
	onToggleMode: () => void;
}

export function mountMobileReadingControls(
	container: HTMLElement,
	options: MobileReadingControlsOptions
): MobileReadingControlsHandle {
	const root = container.createDiv({ cls: 'speed-reader-ai-mobile-reading-controls' });

	const wpmRow = root.createDiv({ cls: 'speed-reader-ai-mobile-reading-row' });
	wpmRow.createSpan({ cls: 'speed-reader-ai-mobile-reading-label', text: 'WPM' });
	const wpmSlider = wpmRow.createEl('input', {
		cls: 'speed-reader-ai-mobile-reading-slider',
		attr: { type: 'range', min: String(MIN_WPM), max: String(MAX_WPM), step: '25' }
	});
	const wpmValue = wpmRow.createSpan({ cls: 'speed-reader-ai-mobile-reading-value' });

	const fontRow = root.createDiv({ cls: 'speed-reader-ai-mobile-reading-row' });
	fontRow.createSpan({ cls: 'speed-reader-ai-mobile-reading-label', text: 'Font size' });
	const fontSlider = fontRow.createEl('input', {
		cls: 'speed-reader-ai-mobile-reading-slider',
		attr: { type: 'range', min: String(MIN_FONT_SIZE), max: String(MAX_FONT_SIZE), step: '1' }
	});
	const fontValue = fontRow.createSpan({ cls: 'speed-reader-ai-mobile-reading-value' });

	const modeRow = root.createDiv({ cls: 'speed-reader-ai-mobile-reading-row' });
	modeRow.createSpan({ cls: 'speed-reader-ai-mobile-reading-label', text: 'Mode' });
	const modeBtn = modeRow.createEl('button', {
		cls: 'speed-reader-ai-mobile-reading-mode-btn',
		text: 'RSVP',
		attr: { type: 'button' }
	});

	const refresh = () => {
		const settings = options.getSettings();
		const state = options.getState();
		const wpm = state ? Math.round(state.currentWpm) : settings.reader.wpm;
		wpmSlider.value = String(wpm);
		wpmValue.setText(String(wpm));
		fontSlider.value = String(settings.reader.fontSize);
		fontValue.setText(`${settings.reader.fontSize}px`);
		const isLineRepeat = state?.playbackMode === 'lineRepeat';
		modeBtn.setText(isLineRepeat ? 'Line repeat' : 'RSVP');
		modeBtn.toggleClass('is-line-repeat', isLineRepeat);
	};

	wpmSlider.addEventListener('input', () => {
		const wpm = Number.parseInt(wpmSlider.value, 10);
		if (!Number.isNaN(wpm)) {
			wpmValue.setText(String(wpm));
			options.onWpmChange(wpm);
		}
	});

	fontSlider.addEventListener('input', () => {
		const fontSize = Number.parseInt(fontSlider.value, 10);
		if (!Number.isNaN(fontSize)) {
			fontValue.setText(`${fontSize}px`);
			options.onFontChange(fontSize);
		}
	});

	modeBtn.addEventListener('click', () => {
		options.onToggleMode();
		refresh();
	});

	refresh();

	return {
		destroy() {
			root.remove();
		},
		refresh
	};
}
