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
	cardBg: string;
	cardText: string;
	inputBg: string;
	inputText: string;
	tabActiveBg: string;
	tabActiveText: string;
	tabInactiveText: string;
	border: string;
	readingBg: string;
	readingSurface: string;
	readingLine: string;
	lineAccent: string;
	accent: string;
	accentSoft: string;
	accentDark: string;
	accentBright: string;
	accentDeep: string;
	accentOn: string;
	readingShadowSoft: string;
	readingShadowCard: string;
	readingShadowAccent: string;
	accentGlow: string;
	saved: string;
	savedSoft: string;
	savedShadow: string;
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
	cardBg: '#141414',
	cardText: '#E8E8E8',
	inputBg: '#FFFFFF',
	inputText: '#000000',
	tabActiveBg: '#FFFFFF',
	tabActiveText: '#000000',
	tabInactiveText: '#9E9E9E',
	border: '#444444',
	readingBg: '#0d0f14',
	readingSurface: '#181c24',
	readingLine: '#2f3844',
	lineAccent: '#F4A896',
	accent: '#d966ff',
	accentSoft: '#2a1838',
	accentDark: '#9b2dff',
	accentBright: '#e580ff',
	accentDeep: '#b833ff',
	accentOn: '#ffffff',
	readingShadowSoft: '0 20px 60px rgba(0, 0, 0, 0.42)',
	readingShadowCard: '0 8px 28px rgba(0, 0, 0, 0.35)',
	readingShadowAccent: '0 14px 38px rgba(217, 102, 255, 0.28)',
	accentGlow: '0 8px 20px rgba(217, 102, 255, 0.38)',
	saved: '#4ade80',
	savedSoft: '#142819',
	savedShadow: '0 14px 38px rgba(74, 222, 128, 0.22)'
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
	cardBg: '#F4F4F4',
	cardText: '#121212',
	inputBg: '#FFFFFF',
	inputText: '#000000',
	tabActiveBg: '#121212',
	tabActiveText: '#FFFFFF',
	tabInactiveText: '#616161',
	border: '#CCCCCC',
	readingBg: '#f8faf9',
	readingSurface: '#ffffff',
	readingLine: '#dfe8e8',
	lineAccent: '#D4645A',
	accent: '#a100ff',
	accentSoft: '#f4e8ff',
	accentDark: '#7b00c8',
	accentBright: '#b100ff',
	accentDeep: '#9100e8',
	accentOn: '#ffffff',
	readingShadowSoft: '0 20px 60px rgba(15, 23, 42, 0.07)',
	readingShadowCard: '0 8px 28px rgba(15, 23, 42, 0.045)',
	readingShadowAccent: '0 14px 38px rgba(161, 0, 255, 0.12)',
	accentGlow: '0 8px 20px rgba(145, 0, 232, 0.24)',
	saved: '#16a34a',
	savedSoft: '#ecfdf3',
	savedShadow: '0 14px 38px rgba(22, 163, 74, 0.16)'
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
	el.style.setProperty('--sr-card-bg', tokens.cardBg);
	el.style.setProperty('--sr-card-text', tokens.cardText);
	el.style.setProperty('--sr-input-bg', tokens.inputBg);
	el.style.setProperty('--sr-input-text', tokens.inputText);
	el.style.setProperty('--sr-tab-active-bg', tokens.tabActiveBg);
	el.style.setProperty('--sr-tab-active-text', tokens.tabActiveText);
	el.style.setProperty('--sr-tab-inactive-text', tokens.tabInactiveText);
	el.style.setProperty('--sr-border', tokens.border);
	el.style.setProperty('--sr-reading-bg', tokens.readingBg);
	el.style.setProperty('--sr-reading-surface', tokens.readingSurface);
	el.style.setProperty('--sr-reading-line', tokens.readingLine);
	el.style.setProperty('--sr-line-accent', tokens.lineAccent);
	el.style.setProperty('--sr-accent', tokens.accent);
	el.style.setProperty('--sr-accent-soft', tokens.accentSoft);
	el.style.setProperty('--sr-accent-dark', tokens.accentDark);
	el.style.setProperty('--sr-accent-bright', tokens.accentBright);
	el.style.setProperty('--sr-accent-deep', tokens.accentDeep);
	el.style.setProperty('--sr-accent-on', tokens.accentOn);
	el.style.setProperty('--sr-reading-shadow-soft', tokens.readingShadowSoft);
	el.style.setProperty('--sr-reading-shadow-card', tokens.readingShadowCard);
	el.style.setProperty('--sr-reading-shadow-accent', tokens.readingShadowAccent);
	el.style.setProperty('--sr-accent-glow', tokens.accentGlow);
	el.style.setProperty('--sr-saved', tokens.saved);
	el.style.setProperty('--sr-saved-soft', tokens.savedSoft);
	el.style.setProperty('--sr-saved-shadow', tokens.savedShadow);
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
