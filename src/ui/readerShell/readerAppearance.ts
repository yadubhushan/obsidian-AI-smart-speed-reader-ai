import type { SpeedReaderAiSettings } from '../../types';
import { applyReaderThemeToElement, readerFontFamily } from './readerThemes';

export const FONT_SIZE_STEP = 3;
export const MIN_FONT_SIZE = 24;
export const MAX_FONT_SIZE = 200;
export const MIN_WPM = 50;
export const MAX_WPM = 5000;

export function clampFontSize(px: number): number {
	return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(px)));
}

export function stepFontSize(current: number, delta: number): number {
	return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, current + delta));
}

export function clampWpm(wpm: number): number {
	return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(wpm)));
}

/** CSS custom-property map for user color overrides; null means "remove". */
export function customReaderColorVars(colors: {
	focusWord?: string;
	centerCharacter?: string;
}): Record<string, string | null> {
	return {
		'--sr-focus-word-color': colors.focusWord || null,
		'--sr-center-character-color': colors.centerCharacter || null
	};
}

export interface ReaderAppearanceEls {
	containerEl: HTMLElement;
	contentEl: HTMLElement;
	getWordContainer(): HTMLElement | null;
	getContextLineRootEl(): HTMLElement | null;
}

export interface ReaderAppearanceHandle {
	applyAll(): void;
	applyTheme(): void;
	applyFontFamily(): void;
	applyFontSize(): void;
	applyContextLineFontSize(): void;
	applyCenterGuideVisibility(): void;
}

/**
 * Single owner of reader styling: theme, custom colors, fonts, and the
 * center guide. Reads settings via the injected getter and writes only DOM.
 */
export function createReaderAppearance(
	els: ReaderAppearanceEls,
	getSettings: () => SpeedReaderAiSettings
): ReaderAppearanceHandle {
	const applyCustomColors = (target: HTMLElement) => {
		const vars = customReaderColorVars(getSettings().reader.colors);
		for (const [name, value] of Object.entries(vars)) {
			if (value) {
				target.style.setProperty(name, value);
			} else {
				target.style.removeProperty(name);
			}
		}
	};

	const handle: ReaderAppearanceHandle = {
		applyTheme(): void {
			const { colorScheme, themePreset } = getSettings().reader;
			applyReaderThemeToElement(els.containerEl, colorScheme, { themePreset });
			applyReaderThemeToElement(els.contentEl, colorScheme, { themePreset });
			applyCustomColors(els.containerEl);
			applyCustomColors(els.contentEl);
		},
		applyFontFamily(): void {
			els.getWordContainer()?.style.setProperty(
				'--speed-reader-ai-font-family',
				readerFontFamily(getSettings().reader.font)
			);
		},
		applyFontSize(): void {
			els.getWordContainer()?.style.setProperty(
				'--speed-reader-ai-font-size',
				`${getSettings().reader.fontSize}px`
			);
		},
		applyContextLineFontSize(): void {
			els.getContextLineRootEl()?.style.setProperty(
				'--speed-reader-ai-context-line-font-size',
				`${getSettings().reader.contextLineFontSize}px`
			);
		},
		applyCenterGuideVisibility(): void {
			els.getWordContainer()?.toggleClass(
				'is-center-guide-hidden',
				!getSettings().reader.display.showCenterGuide
			);
		},
		applyAll(): void {
			handle.applyTheme();
			handle.applyFontFamily();
			handle.applyFontSize();
			handle.applyContextLineFontSize();
			handle.applyCenterGuideVisibility();
		}
	};

	return handle;
}
