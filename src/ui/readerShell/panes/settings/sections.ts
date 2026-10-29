import { PLAYBACK_MODE_ORDER, getPlaybackModeLabel } from '../../../../engine/playbackMode';
import {
	DEFAULT_SETTINGS,
	READER_FONT_OPTIONS,
	type ReaderThemePresetId,
	type SpeedReaderAiSettings
} from '../../../../types';
import { READER_THEME_PRESET_ORDER, READER_THEME_PRESETS } from '../../readerThemePresets';
import { card, segmented, selectRow, slider, stepper, switchRow } from './controls';
import { mountVoiceControls } from './voiceControls';

export type ReaderSettings = SpeedReaderAiSettings['reader'];

export interface SettingsSectionContext {
	/** The pane's live draft. Read freely; change only through `update`. */
	reader(): ReaderSettings;
	/** Apply a change to the draft and persist it. Debounce for continuous inputs (sliders, steppers). */
	update(mutate: (reader: ReaderSettings) => void, options?: { debounce?: boolean }): void;
}

export interface SettingsSection {
	/** Re-evaluate which rows apply after any draft change. */
	sync(): void;
	destroy?(): void;
}

const FALLBACK_FOCUS_WORD_COLOR = '#ffffff';
const FALLBACK_CENTER_CHARACTER_COLOR = '#ff8c00';

export function buildReadingCard(parent: HTMLElement, ctx: SettingsSectionContext): SettingsSection {
	const reader = ctx.reader();
	const body = card(parent, 'Reading');
	stepper(body, 'Words per minute', { value: reader.wpm, min: 50, max: 5000, step: 25 }, (wpm) =>
		ctx.update((r) => {
			r.wpm = wpm;
		}, { debounce: true })
	);
	segmented(
		body,
		'Default mode',
		PLAYBACK_MODE_ORDER.map((mode) => ({ value: mode, label: getPlaybackModeLabel(mode) })),
		reader.defaultPlaybackMode,
		(mode) =>
			ctx.update((r) => {
				r.defaultPlaybackMode = mode;
			})
	);
	const chunk = slider(body, 'Words per chunk', { value: reader.chunkSize, min: 1, max: 30 }, (size) =>
		ctx.update((r) => {
			r.chunkSize = size;
		}, { debounce: true })
	);
	const maxWordLength = slider(
		body,
		'Max word length',
		{ value: reader.progressiveRsvpMaxWordLength, min: 1, max: 10 },
		(length) =>
			ctx.update((r) => {
				r.progressiveRsvpMaxWordLength = length;
			}, { debounce: true })
	);

	const rampStart = stepper(body, 'Ramp start WPM', { value: reader.rampStartWpm, min: 50, max: 5000, step: 25 }, (wpm) =>
		ctx.update((r) => {
			r.rampStartWpm = wpm;
		}, { debounce: true })
	);
	const rampTarget = stepper(body, 'Ramp target WPM', { value: reader.rampTargetWpm, min: 50, max: 5000, step: 25 }, (wpm) =>
		ctx.update((r) => {
			r.rampTargetWpm = wpm;
		}, { debounce: true })
	);
	const rampMinutes = slider(body, 'Ramp minutes', { value: reader.rampMinutes, min: 1, max: 60 }, (minutes) =>
		ctx.update((r) => {
			r.rampMinutes = minutes;
		}, { debounce: true })
	);

	return {
		sync() {
			const mode = ctx.reader().defaultPlaybackMode;
			chunk.setVisible(mode === 'rsvp');
			maxWordLength.setVisible(mode === 'progressiveRsvp');
			for (const row of [rampStart, rampTarget, rampMinutes]) {
				row.setVisible(mode === 'rampRsvp');
			}
		}
	};
}

function buildThemeGrid(parent: HTMLElement, ctx: SettingsSectionContext): void {
	const themeGrid = parent.createDiv({ cls: 'speed-reader-ai-theme-grid' });
	const selected = ctx.reader().themePreset;
	for (const presetId of READER_THEME_PRESET_ORDER) {
		const preset = READER_THEME_PRESETS[presetId];
		const themeCard = themeGrid.createEl('button', {
			cls: `speed-reader-ai-theme-card speed-reader-ai-theme-${presetId}${selected === presetId ? ' is-selected' : ''}`,
			attr: { type: 'button', 'data-theme-preset': presetId, 'aria-pressed': String(selected === presetId) }
		});
		const swatch = themeCard.createDiv({ cls: 'speed-reader-ai-theme-swatch' });
		swatch.createSpan({
			cls: 'speed-reader-ai-theme-swatch-primary',
			attr: { style: `background:${preset.swatchPrimary}` }
		});
		swatch.createSpan({
			cls: 'speed-reader-ai-theme-swatch-secondary',
			attr: { style: `background:${preset.swatchSecondary}` }
		});
		themeCard.createSpan({ cls: 'speed-reader-ai-theme-card-label', text: preset.label });
		if (selected === presetId) {
			themeCard.createSpan({ cls: 'speed-reader-ai-theme-card-check', text: '✓' });
		}
		themeCard.addEventListener('click', () => {
			for (const btn of themeGrid.querySelectorAll<HTMLButtonElement>('.speed-reader-ai-theme-card')) {
				const id = btn.dataset.themePreset as ReaderThemePresetId;
				btn.toggleClass('is-selected', id === presetId);
				btn.setAttr('aria-pressed', String(id === presetId));
				btn.querySelector('.speed-reader-ai-theme-card-check')?.remove();
				if (id === presetId) {
					btn.createSpan({ cls: 'speed-reader-ai-theme-card-check', text: '✓' });
				}
			}
			ctx.update((r) => {
				r.themePreset = presetId;
			});
		});
	}
}

function buildCustomColors(parent: HTMLElement, ctx: SettingsSectionContext): void {
	const colors = ctx.reader().colors;
	const details = parent.createEl('details', { cls: 'speed-reader-ai-settings-disclosure' });
	details.open = Boolean(colors.focusWord || colors.centerCharacter);
	details.createEl('summary', { text: 'Customize colors' });

	const colorRow = (label: string, value: string, fallback: string, apply: (r: ReaderSettings, color: string) => void) => {
		const rowEl = details.createDiv({ cls: 'speed-reader-ai-settings-row' });
		rowEl.createDiv({ cls: 'speed-reader-ai-settings-row-text' }).createEl('label', {
			cls: 'speed-reader-ai-settings-row-label',
			text: label
		});
		const input = rowEl.createDiv({ cls: 'speed-reader-ai-settings-row-control' }).createEl('input', {
			cls: 'speed-reader-ai-settings-color',
			attr: { type: 'color', 'aria-label': label }
		});
		input.value = value || fallback;
		input.addEventListener('input', () => ctx.update((r) => apply(r, input.value), { debounce: true }));
		return { input, fallback };
	};
	const focus = colorRow('Focus word', colors.focusWord, FALLBACK_FOCUS_WORD_COLOR, (r, color) => {
		r.colors.focusWord = color;
	});
	const center = colorRow('Center character', colors.centerCharacter, FALLBACK_CENTER_CHARACTER_COLOR, (r, color) => {
		r.colors.centerCharacter = color;
	});

	const reset = details.createEl('button', {
		cls: 'speed-reader-ai-settings-ghost-btn',
		text: 'Use theme colors',
		attr: { type: 'button' }
	});
	reset.addEventListener('click', () => {
		focus.input.value = focus.fallback;
		center.input.value = center.fallback;
		ctx.update((r) => {
			r.colors = { focusWord: '', centerCharacter: '' };
		});
	});
}

export function buildAppearanceCard(parent: HTMLElement, ctx: SettingsSectionContext): SettingsSection {
	const reader = ctx.reader();
	const body = card(parent, 'Appearance');
	buildThemeGrid(body, ctx);
	segmented(
		body,
		'Color scheme',
		[
			{ value: 'dark', label: 'Dark' },
			{ value: 'light', label: 'Light' },
			{ value: 'auto', label: 'Auto' }
		] as const,
		reader.colorScheme,
		(scheme) =>
			ctx.update((r) => {
				r.colorScheme = scheme;
			})
	);
	selectRow(
		body,
		'Font',
		READER_FONT_OPTIONS.map((font) => ({ value: font, label: font })),
		reader.font,
		(font) =>
			ctx.update((r) => {
				r.font = font;
			})
	);
	const wordSize = slider(body, 'Word size', { value: reader.fontSize, min: 24, max: 200, suffix: 'px' }, (size) =>
		ctx.update((r) => {
			r.fontSize = size;
		}, { debounce: true })
	);
	const resetSize = wordSize.control.createEl('button', {
		cls: 'speed-reader-ai-settings-ghost-btn',
		text: 'Reset',
		attr: { type: 'button', 'aria-label': 'Reset word size' }
	});
	resetSize.addEventListener('click', () => {
		wordSize.setValue(DEFAULT_SETTINGS.reader.fontSize);
		ctx.update((r) => {
			r.fontSize = DEFAULT_SETTINGS.reader.fontSize;
		});
	});
	const contextSize = slider(
		body,
		'Context line size',
		{ value: reader.contextLineFontSize, min: 12, max: 32, suffix: 'px' },
		(size) =>
			ctx.update((r) => {
				r.contextLineFontSize = size;
			}, { debounce: true })
	);
	buildCustomColors(body, ctx);

	return {
		sync() {
			contextSize.setVisible(ctx.reader().display.showContext);
		}
	};
}

export function buildDisplayCard(parent: HTMLElement, ctx: SettingsSectionContext): SettingsSection {
	const display = ctx.reader().display;
	const body = card(parent, 'Display');
	const toggle = (label: string, key: keyof ReaderSettings['display']) =>
		switchRow(body, label, display[key], (on) =>
			ctx.update((r) => {
				r.display[key] = on;
			})
		);
	toggle('Remaining time', 'showRemainingTime');
	toggle('Context line', 'showContext');
	toggle('Progress bar', 'showProgress');
	toggle('Center guide line', 'showCenterGuide');
	return { sync() {} };
}

export function buildBehaviorCard(parent: HTMLElement, ctx: SettingsSectionContext): SettingsSection {
	const reader = ctx.reader();
	const body = card(parent, 'Behavior');
	switchRow(body, 'Auto start', reader.autoStart.enabled, (on) =>
		ctx.update((r) => {
			r.autoStart.enabled = on;
		})
	);
	const delay = stepper(
		body,
		'Start after',
		{ value: reader.autoStart.seconds, min: 1, max: 60, step: 1, suffix: 's' },
		(seconds) =>
			ctx.update((r) => {
				r.autoStart.seconds = seconds;
			}, { debounce: true })
	);
	switchRow(body, 'Close reader when finished', reader.autoCloseOnCompletion, (on) =>
		ctx.update((r) => {
			r.autoCloseOnCompletion = on;
		})
	);
	switchRow(body, 'Right-to-left text', reader.textOrientation.rtl, (on) =>
		ctx.update((r) => {
			r.textOrientation.rtl = on;
		})
	);
	switchRow(body, 'Auto-detect text direction', reader.textOrientation.autoDetect, (on) =>
		ctx.update((r) => {
			r.textOrientation.autoDetect = on;
		})
	);
	return {
		sync() {
			delay.setVisible(ctx.reader().autoStart.enabled);
		}
	};
}

export function buildVoiceCard(parent: HTMLElement, ctx: SettingsSectionContext): SettingsSection {
	const body = card(parent, 'Voice');
	const voice = mountVoiceControls(body, ctx.reader().ttsVoiceUri, (voiceUri) =>
		ctx.update((r) => {
			r.ttsVoiceUri = voiceUri;
		})
	);
	return { sync() {}, destroy: () => voice.destroy() };
}

/** Reader fields this pane owns; "Reset" restores only these, not the plugin-tab settings. */
export function resetPaneFieldsToDefaults(r: ReaderSettings): void {
	const d = structuredClone(DEFAULT_SETTINGS.reader);
	r.font = d.font;
	r.fontSize = d.fontSize;
	r.contextLineFontSize = d.contextLineFontSize;
	r.wpm = d.wpm;
	r.chunkSize = d.chunkSize;
	r.defaultPlaybackMode = d.defaultPlaybackMode;
	r.progressiveRsvpMaxWordLength = d.progressiveRsvpMaxWordLength;
	r.rampStartWpm = d.rampStartWpm;
	r.rampTargetWpm = d.rampTargetWpm;
	r.rampMinutes = d.rampMinutes;
	r.colorScheme = d.colorScheme;
	r.themePreset = d.themePreset;
	r.colors = d.colors;
	r.autoStart = d.autoStart;
	r.autoCloseOnCompletion = d.autoCloseOnCompletion;
	r.textOrientation = d.textOrientation;
	r.display = d.display;
	r.ttsVoiceUri = d.ttsVoiceUri;
}
