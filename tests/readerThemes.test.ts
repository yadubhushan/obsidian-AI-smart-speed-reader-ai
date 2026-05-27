/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	resolveReaderTheme,
	getReaderThemeTokens,
	applyReaderThemeToElement
} from '../src/ui/readerShell/readerThemes';

describe('readerThemes', () => {
	beforeEach(() => {
		document.body.classList.remove('theme-dark', 'theme-light');
	});

	afterEach(() => {
		document.body.classList.remove('theme-dark', 'theme-light');
	});

	it('resolveReaderTheme returns explicit dark/light', () => {
		expect(resolveReaderTheme('dark')).toBe('dark');
		expect(resolveReaderTheme('light')).toBe('light');
	});

	it('resolveReaderTheme auto follows Obsidian body class', () => {
		document.body.classList.add('theme-dark');
		expect(resolveReaderTheme('auto')).toBe('dark');

		document.body.classList.remove('theme-dark');
		document.body.classList.add('theme-light');
		expect(resolveReaderTheme('auto')).toBe('light');
	});

	it('dark tokens match WCAG plan values', () => {
		const tokens = getReaderThemeTokens('dark');
		expect(tokens.bg).toBe('#000000');
		expect(tokens.text).toBe('#FFFFFF');
		expect(tokens.orp).toBe('#FF8C00');
		expect(tokens.muted).toBe('#9E9E9E');
		expect(tokens.cardBg).toBe('#141414');
		expect(tokens.cardText).toBe('#E8E8E8');
	});

	it('light tokens match WCAG plan values', () => {
		const tokens = getReaderThemeTokens('light');
		expect(tokens.bg).toBe('#FFFFFF');
		expect(tokens.text).toBe('#121212');
		expect(tokens.orp).toBe('#E65100');
		expect(tokens.contentPanelBg).toBe('#FFFFFF');
	});

	it('merges theme preset orp and lineAccent onto dark base tokens', () => {
		const tokens = getReaderThemeTokens('dark', 'cyber-mint');
		expect(tokens.orp).toBe('#00f5a0');
		expect(tokens.lineAccent).toBe('#00d9f5');
		expect(tokens.bg).toBe('#000000');
	});

	it('applyReaderThemeToElement applies preset colors', () => {
		const el = document.createElement('div') as HTMLElement & {
			toggleClass: (cls: string, flag?: boolean) => void;
		};
		el.toggleClass = (cls: string, flag?: boolean) => {
			el.classList.toggle(cls, flag);
		};
		applyReaderThemeToElement(el, 'dark', { themePreset: 'crimson-surge' });
		expect(el.style.getPropertyValue('--sr-orp')).toBe('#ff5a1f');
		expect(el.style.getPropertyValue('--sr-line-accent')).toBe('#dd2476');
	});

	it('applyReaderThemeToElement sets CSS variables on element', () => {
		const el = document.createElement('div') as HTMLElement & {
			toggleClass: (cls: string, flag?: boolean) => void;
		};
		el.toggleClass = (cls: string, flag?: boolean) => {
			el.classList.toggle(cls, flag);
		};
		applyReaderThemeToElement(el, 'dark');
		expect(el.style.getPropertyValue('--sr-bg')).toBe('#000000');
		expect(el.style.getPropertyValue('--sr-orp')).toBe('#FF8C00');
		expect(el.style.getPropertyValue('--sr-card-bg')).toBe('#141414');
		expect(el.style.getPropertyValue('--sr-accent')).toBe('#d966ff');
		expect(el.style.getPropertyValue('--sr-accent-bright')).toBe('#e580ff');
		expect(el.classList.contains('speed-reader-theme-dark')).toBe(true);

		applyReaderThemeToElement(el, 'light');
		expect(el.style.getPropertyValue('--sr-accent')).toBe('#a100ff');
		expect(el.style.getPropertyValue('--sr-reading-bg')).toBe('#f8faf9');
		expect(el.classList.contains('speed-reader-theme-light')).toBe(true);
	});
});
