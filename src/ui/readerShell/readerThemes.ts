import type { ReaderColorScheme } from '../../types';

export type ResolvedReaderTheme = 'dark' | 'light';

export interface ReaderThemeTokens {
	bg: string;
	text: string;
	orp: string;
	muted: string;
	progressTrack: string;
	progressFill: string;
	contentPanelBg: string;
	contentPanelText: string;
	inputBg: string;
	inputText: string;
	tabActiveBg: string;
	tabActiveText: string;
	tabInactiveText: string;
	border: string;
}

const DARK_TOKENS: ReaderThemeTokens = {
	bg: '#000000',
	text: '#FFFFFF',
	orp: '#FF8C00',
	muted: '#9E9E9E',
	progressTrack: '#333333',
	progressFill: '#FFFFFF',
	contentPanelBg: '#FFFFFF',
	contentPanelText: '#000000',
	inputBg: '#FFFFFF',
	inputText: '#000000',
	tabActiveBg: '#FFFFFF',
	tabActiveText: '#000000',
	tabInactiveText: '#9E9E9E',
	border: '#444444'
};

const LIGHT_TOKENS: ReaderThemeTokens = {
	bg: '#FFFFFF',
	text: '#121212',
	orp: '#E65100',
	muted: '#616161',
	progressTrack: '#E0E0E0',
	progressFill: '#121212',
	contentPanelBg: '#FFFFFF',
	contentPanelText: '#000000',
	inputBg: '#FFFFFF',
	inputText: '#000000',
	tabActiveBg: '#121212',
	tabActiveText: '#FFFFFF',
	tabInactiveText: '#616161',
	border: '#CCCCCC'
};

export function resolveReaderTheme(
	colorScheme: ReaderColorScheme,
	isObsidianDark = document.body.classList.contains('theme-dark')
): ResolvedReaderTheme {
	if (colorScheme === 'auto') {
		return isObsidianDark ? 'dark' : 'light';
	}
	return colorScheme;
}

export function getReaderThemeTokens(resolved: ResolvedReaderTheme): ReaderThemeTokens {
	return resolved === 'light' ? LIGHT_TOKENS : DARK_TOKENS;
}

export function applyReaderThemeToElement(
	el: HTMLElement,
	colorScheme: ReaderColorScheme,
	isObsidianDark?: boolean
): ResolvedReaderTheme {
	const resolved = resolveReaderTheme(colorScheme, isObsidianDark);
	const tokens = getReaderThemeTokens(resolved);
	el.style.setProperty('--sr-bg', tokens.bg);
	el.style.setProperty('--sr-text', tokens.text);
	el.style.setProperty('--sr-orp', tokens.orp);
	el.style.setProperty('--sr-muted', tokens.muted);
	el.style.setProperty('--sr-progress-track', tokens.progressTrack);
	el.style.setProperty('--sr-progress-fill', tokens.progressFill);
	el.style.setProperty('--sr-content-panel-bg', tokens.contentPanelBg);
	el.style.setProperty('--sr-content-panel-text', tokens.contentPanelText);
	el.style.setProperty('--sr-input-bg', tokens.inputBg);
	el.style.setProperty('--sr-input-text', tokens.inputText);
	el.style.setProperty('--sr-tab-active-bg', tokens.tabActiveBg);
	el.style.setProperty('--sr-tab-active-text', tokens.tabActiveText);
	el.style.setProperty('--sr-tab-inactive-text', tokens.tabInactiveText);
	el.style.setProperty('--sr-border', tokens.border);
	el.toggleClass('speed-reader-theme-dark', resolved === 'dark');
	el.toggleClass('speed-reader-theme-light', resolved === 'light');
	return resolved;
}

export function readerFontFamily(font: string): string {
	switch (font) {
		case 'Arial':
			return 'Arial, Helvetica, sans-serif';
		case 'Georgia':
			return 'Georgia, "Times New Roman", serif';
		case 'monospace':
			return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
		default:
			return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
	}
}
