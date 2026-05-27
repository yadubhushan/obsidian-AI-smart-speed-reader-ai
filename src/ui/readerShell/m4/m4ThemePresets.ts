import type { M4ThemePresetId } from '../../../types';
import type { ReaderThemeTokens } from '../readerThemes';

export interface M4ThemePresetMeta {
	id: M4ThemePresetId;
	name: string;
	rawHex: string;
}

export interface M4ThemePresetOverrides {
	orp: string;
	lineAccent: string;
	accent: string;
	accentBright: string;
	accentDeep: string;
	accentDark: string;
	readingBg: string;
	readingSurface: string;
	readingLine: string;
	border: string;
	muted: string;
}

export const M4_THEME_PRESET_META: M4ThemePresetMeta[] = [
	{ id: 'vintage-amber', name: 'Vintage Amber', rawHex: '#E59885' },
	{ id: 'cyber-mint', name: 'Cyber Mint', rawHex: '#00f5a0' },
	{ id: 'nova-violet', name: 'Nova Violet', rawHex: '#7B51F8' },
	{ id: 'crimson-surge', name: 'Crimson Surge', rawHex: '#ff5a1f' }
];

const PRESET_OVERRIDES: Record<M4ThemePresetId, M4ThemePresetOverrides> = {
	'vintage-amber': {
		orp: '#E59885',
		lineAccent: '#E59885',
		accent: '#00f5a0',
		accentBright: '#bcb6ff',
		accentDeep: '#847df0',
		accentDark: '#40368a',
		readingBg: '#05040d',
		readingSurface: '#120f32',
		readingLine: '#21195d',
		border: '#21195d',
		muted: '#635cb0'
	},
	'cyber-mint': {
		orp: '#00f5a0',
		lineAccent: '#00d9f5',
		accent: '#00f5a0',
		accentBright: '#00f5a0',
		accentDeep: '#00d9f5',
		accentDark: '#008f6b',
		readingBg: '#030812',
		readingSurface: '#0a1a24',
		readingLine: '#123548',
		border: '#123548',
		muted: '#4a8f8a'
	},
	'nova-violet': {
		orp: '#9d7fff',
		lineAccent: '#7B51F8',
		accent: '#7B51F8',
		accentBright: '#9d7fff',
		accentDeep: '#4c12df',
		accentDark: '#3d31a1',
		readingBg: '#06040f',
		readingSurface: '#120f32',
		readingLine: '#251d6c',
		border: '#251d6c',
		muted: '#716aab'
	},
	'crimson-surge': {
		orp: '#ff5a1f',
		lineAccent: '#dd2476',
		accent: '#ff5a1f',
		accentBright: '#ff5a1f',
		accentDeep: '#dd2476',
		accentDark: '#b91c1c',
		readingBg: '#0a0408',
		readingSurface: '#1a0f18',
		readingLine: '#3d1a30',
		border: '#3d1a30',
		muted: '#9f6080'
	}
};

export function getM4PresetOverrides(presetId: M4ThemePresetId): M4ThemePresetOverrides {
	return PRESET_OVERRIDES[presetId] ?? PRESET_OVERRIDES['vintage-amber'];
}

export function mergeThemeTokensWithPreset(
	base: ReaderThemeTokens,
	presetId: M4ThemePresetId
): ReaderThemeTokens {
	const overrides = getM4PresetOverrides(presetId);
	return {
		...base,
		orp: overrides.orp,
		lineAccent: overrides.lineAccent,
		accent: overrides.accent,
		accentBright: overrides.accentBright,
		accentDeep: overrides.accentDeep,
		accentDark: overrides.accentDark,
		readingBg: overrides.readingBg,
		readingSurface: overrides.readingSurface,
		readingLine: overrides.readingLine,
		border: overrides.border,
		muted: overrides.muted,
		accentSoft: `${overrides.accentDark}33`,
		accentGlow: `0 8px 20px ${overrides.accent}44`,
		readingShadowAccent: `0 14px 38px ${overrides.accent}33`
	};
}

export function applyM4ShellTokens(el: HTMLElement, presetId: M4ThemePresetId): void {
	const overrides = getM4PresetOverrides(presetId);
	el.setAttribute('data-theme-preset', presetId);
	el.style.setProperty('--speed-reader-m4-bg', overrides.readingBg);
	el.style.setProperty('--speed-reader-m4-surface', overrides.readingSurface);
	el.style.setProperty('--speed-reader-m4-surface-hover', overrides.readingSurface);
	el.style.setProperty('--speed-reader-m4-border', overrides.border);
	el.style.setProperty('--speed-reader-m4-panel', '#000000');
	el.style.setProperty('--speed-reader-m4-text', overrides.accentBright);
	el.style.setProperty('--speed-reader-m4-muted', overrides.muted);
	el.style.setProperty('--speed-reader-m4-context', '#736da6');
	el.style.setProperty('--speed-reader-m4-accent', overrides.accent);
	el.style.setProperty('--speed-reader-m4-accent-warn', '#ffaa2b');
	el.style.setProperty('--speed-reader-m4-orp', overrides.orp);
	el.style.setProperty('--speed-reader-m4-gradient-from', overrides.accentBright);
	el.style.setProperty('--speed-reader-m4-gradient-to', overrides.accentDeep);
	el.style.setProperty('--speed-reader-m4-violet', '#7B51F8');
	el.style.setProperty('--speed-reader-m4-radius-lg', '24px');
	el.style.setProperty('--speed-reader-m4-radius-md', '12px');
}
