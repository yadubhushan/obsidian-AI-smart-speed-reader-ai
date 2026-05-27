import { PLAYBACK_MODE_ORDER, getPlaybackModeLabel } from '../../../engine/playbackMode';
import { DEFAULT_SETTINGS, READER_FONT_OPTIONS, type PlaybackMode, type ReaderThemePresetId, type SpeedReaderAiSettings } from '../../../types';
import { MOBILE_ROUTE_LABELS } from '../mobileNavigation';
import { mountMobileStackChrome, type MobileStackChromeHandle } from '../mobileStackChrome';
import {
	READER_THEME_PRESET_ORDER,
	READER_THEME_PRESETS
} from '../readerThemePresets';

export interface SettingsPaneHandle {
	destroy(): void;
	refresh(settings: SpeedReaderAiSettings): void;
	onSwipeBack(cb: () => void): void;
}

export function mountSettingsPane(
	container: HTMLElement,
	settings: SpeedReaderAiSettings,
	handlers: {
		onSave: (settings: SpeedReaderAiSettings) => void;
		onDefaults: () => SpeedReaderAiSettings;
		onResetFontSize: () => void;
		showMobileGesturesGuide?: boolean;
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
			ignoreSwipeSelectors: '.speed-reader-ai-settings-actions'
		});
		bodyHost = pane.createDiv({ cls: 'speed-reader-ai-mobile-stack-body' });
	}
	let draft = structuredClone(settings);

	const render = () => {
		bodyHost.empty();
		if (handlers.showMobileGesturesGuide) {
			const guide = bodyHost.createDiv({ cls: 'speed-reader-ai-settings-gestures-guide' });
			guide.createEl('h4', { text: 'Mobile gestures' });
			const list = guide.createEl('ul');
			const items = [
				'While playing: tap center of word strip to play or pause',
				'While playing: hold left or right of word strip to skip back or forward',
				'While playing: hold above word strip to increase speed; hold below to decrease',
				'While paused: double-tap left or right to skip back or forward',
				'While paused: long-press word to look up definition',
				'While paused: tap a context word to define; tap 🔖 to bookmark',
				'While paused: swipe left or right to skip'
			];
			for (const text of items) {
				list.createEl('li', { text });
			}
		}
		const themeSection = bodyHost.createDiv({ cls: 'speed-reader-ai-theme-explorer' });
		themeSection.createEl('h4', { text: 'Theme Explorer' });
		const themeGrid = themeSection.createDiv({ cls: 'speed-reader-ai-theme-grid' });
		let selectedThemePreset = draft.reader.themePreset;

		for (const presetId of READER_THEME_PRESET_ORDER) {
			const preset = READER_THEME_PRESETS[presetId];
			const card = themeGrid.createEl('button', {
				cls: `speed-reader-ai-theme-card speed-reader-ai-theme-${presetId}${selectedThemePreset === presetId ? ' is-selected' : ''}`,
				attr: { type: 'button', 'data-theme-preset': presetId }
			});
			const swatch = card.createDiv({ cls: 'speed-reader-ai-theme-swatch' });
			swatch.createSpan({
				cls: 'speed-reader-ai-theme-swatch-primary',
				attr: { style: `background:${preset.swatchPrimary}` }
			});
			swatch.createSpan({
				cls: 'speed-reader-ai-theme-swatch-secondary',
				attr: { style: `background:${preset.swatchSecondary}` }
			});
			card.createSpan({ cls: 'speed-reader-ai-theme-card-label', text: preset.label });
			if (selectedThemePreset === presetId) {
				card.createSpan({ cls: 'speed-reader-ai-theme-card-check', text: '✓' });
			}
			card.addEventListener('click', () => {
				selectedThemePreset = presetId;
				for (const btn of themeGrid.querySelectorAll<HTMLButtonElement>('.speed-reader-ai-theme-card')) {
					const id = btn.dataset.themePreset as ReaderThemePresetId;
					btn.toggleClass('is-selected', id === presetId);
					btn.querySelector('.speed-reader-ai-theme-card-check')?.remove();
					if (id === presetId) {
						btn.createSpan({ cls: 'speed-reader-ai-theme-card-check', text: '✓' });
					}
				}
			});
		}

		const grid = bodyHost.createDiv({ cls: 'speed-reader-ai-settings-grid' });
		const left = grid.createDiv({ cls: 'speed-reader-ai-settings-col' });
		const right = grid.createDiv({ cls: 'speed-reader-ai-settings-col' });

		left.createEl('label', { text: 'Font' });
		const fontSelect = left.createEl('select', { cls: 'speed-reader-ai-settings-input' });
		for (const font of READER_FONT_OPTIONS) {
			fontSelect.createEl('option', { text: font, value: font });
		}
		fontSelect.value = draft.reader.font;

		left.createEl('label', { text: 'Font Size (pixels)' });
		const fontSizeInput = left.createEl('input', {
			cls: 'speed-reader-ai-settings-input',
			attr: { type: 'number', min: '24', max: '200' }
		});
		fontSizeInput.value = String(draft.reader.fontSize);

		left.createEl('label', { text: 'Context line font size (pixels)' });
		const contextLineFontSizeInput = left.createEl('input', {
			cls: 'speed-reader-ai-settings-input',
			attr: { type: 'number', min: '12', max: '32' }
		});
		contextLineFontSizeInput.value = String(draft.reader.contextLineFontSize);

		left.createEl('label', { text: 'Words per minute (WPM)' });
		const wpmInput = left.createEl('input', {
			cls: 'speed-reader-ai-settings-input',
			attr: { type: 'number', min: '50', max: '5000' }
		});
		wpmInput.value = String(draft.reader.wpm);

		left.createEl('label', { text: 'Words per chunk' });
		const chunkSizeInput = left.createEl('input', {
			cls: 'speed-reader-ai-settings-input',
			attr: { type: 'number', min: '1', max: '30' }
		});
		chunkSizeInput.value = String(draft.reader.chunkSize);
		left.createSpan({
			cls: 'speed-reader-ai-settings-hint',
			text: 'Progressive RSVP uses max word length below instead.'
		});

		left.createEl('label', { text: 'Default playback mode' });
		const defaultModeSelect = left.createEl('select', { cls: 'speed-reader-ai-settings-input' });
		for (const mode of PLAYBACK_MODE_ORDER) {
			defaultModeSelect.createEl('option', { text: getPlaybackModeLabel(mode), value: mode });
		}
		defaultModeSelect.value = draft.reader.defaultPlaybackMode;

		left.createEl('label', { text: 'Progressive RSVP max word length' });
		const progressiveRsvpInput = left.createEl('input', {
			cls: 'speed-reader-ai-settings-input',
			attr: { type: 'number', min: '1', max: '10' }
		});
		progressiveRsvpInput.value = String(draft.reader.progressiveRsvpMaxWordLength);

		left.createEl('label', { text: 'Color Scheme' });
		const schemeSelect = left.createEl('select', { cls: 'speed-reader-ai-settings-input' });
		for (const scheme of ['dark', 'light', 'auto'] as const) {
			schemeSelect.createEl('option', { text: scheme.charAt(0).toUpperCase() + scheme.slice(1), value: scheme });
		}
		schemeSelect.value = draft.reader.colorScheme;

		right.createEl('h4', { text: 'Auto start (seconds)' });
		const autoStartRow = right.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const autoStartCheck = autoStartRow.createEl('input', { attr: { type: 'checkbox' } });
		autoStartCheck.checked = draft.reader.autoStart.enabled;
		const autoStartSeconds = autoStartRow.createEl('input', {
			cls: 'speed-reader-ai-settings-input speed-reader-ai-settings-input-small',
			attr: { type: 'number', min: '1', max: '60' }
		});
		autoStartSeconds.value = String(draft.reader.autoStart.seconds);

		const autoCloseRow = right.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const autoCloseCheck = autoCloseRow.createEl('input', { attr: { type: 'checkbox' } });
		autoCloseCheck.checked = draft.reader.autoCloseOnCompletion;
		autoCloseRow.createSpan({ text: 'Auto close reader window on completion' });

		right.createEl('h4', { text: 'Text orientation (Section)' });
		const rtlRow = right.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const rtlCheck = rtlRow.createEl('input', { attr: { type: 'checkbox' } });
		rtlCheck.checked = draft.reader.textOrientation.rtl;
		rtlRow.createSpan({ text: 'Words read from right-to-left (RTL)' });

		const autoDetectRow = right.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const autoDetectCheck = autoDetectRow.createEl('input', { attr: { type: 'checkbox' } });
		autoDetectCheck.checked = draft.reader.textOrientation.autoDetect;
		autoDetectRow.createSpan({ text: 'Try auto-detecting text orientation' });

		right.createEl('h4', { text: 'Display (Section)' });
		const remainingRow = right.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const remainingCheck = remainingRow.createEl('input', { attr: { type: 'checkbox' } });
		remainingCheck.checked = draft.reader.display.showRemainingTime;
		remainingRow.createSpan({ text: 'Show Remaining Time' });

		const contextRow = right.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const contextCheck = contextRow.createEl('input', { attr: { type: 'checkbox' } });
		contextCheck.checked = draft.reader.display.showContext;
		contextRow.createSpan({ text: 'Show context line' });

		const progressRow = right.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const progressCheck = progressRow.createEl('input', { attr: { type: 'checkbox' } });
		progressCheck.checked = draft.reader.display.showProgress;
		progressRow.createSpan({ text: 'Show progress bar' });

		const actions = bodyHost.createDiv({ cls: 'speed-reader-ai-settings-actions' });
		const saveBtn = actions.createEl('button', { cls: 'speed-reader-ai-settings-action-btn', text: 'Save' });
		const defaultsBtn = actions.createEl('button', {
			cls: 'speed-reader-ai-settings-action-btn',
			text: 'Defaults'
		});
		const resetSizeBtn = actions.createEl('button', {
			cls: 'speed-reader-ai-settings-action-btn',
			text: 'Reset Size'
		});

		const applyDraftFromForm = () => {
			draft = {
				...draft,
				reader: {
					...draft.reader,
					font: fontSelect.value as SpeedReaderAiSettings['reader']['font'],
					fontSize: Number(fontSizeInput.value),
					contextLineFontSize: Number(contextLineFontSizeInput.value),
					wpm: Number(wpmInput.value),
					chunkSize: Number(chunkSizeInput.value),
					defaultPlaybackMode: defaultModeSelect.value as PlaybackMode,
					progressiveRsvpMaxWordLength: Number(progressiveRsvpInput.value),
					colorScheme: schemeSelect.value as SpeedReaderAiSettings['reader']['colorScheme'],
					themePreset: selectedThemePreset,
					autoStart: {
						enabled: autoStartCheck.checked,
						seconds: Number(autoStartSeconds.value)
					},
					autoCloseOnCompletion: autoCloseCheck.checked,
					textOrientation: {
						rtl: rtlCheck.checked,
						autoDetect: autoDetectCheck.checked
					},
					display: {
						showRemainingTime: remainingCheck.checked,
						showContext: contextCheck.checked,
						showProgress: progressCheck.checked
					}
				}
			};
		};

		saveBtn.addEventListener('click', () => {
			applyDraftFromForm();
			handlers.onSave(draft);
		});
		defaultsBtn.addEventListener('click', () => {
			draft = handlers.onDefaults();
			render();
		});
		resetSizeBtn.addEventListener('click', () => {
			draft.reader.fontSize = DEFAULT_SETTINGS.reader.fontSize;
			handlers.onResetFontSize();
			render();
		});
	};

	render();

	return {
		destroy() {
			stackChrome?.destroy();
			pane.remove();
		},
		refresh(next) {
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
