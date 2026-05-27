export type ReaderThemePresetId =
	| 'vintage-amber'
	| 'cyber-mint'
	| 'nova-violet'
	| 'crimson-surge';

export interface ReaderThemePreset {
	id: ReaderThemePresetId;
	label: string;
	orp: string;
	lineAccent: string;
	swatchPrimary: string;
	swatchSecondary: string;
}

export const READER_THEME_PRESET_ORDER: ReaderThemePresetId[] = [
	'vintage-amber',
	'cyber-mint',
	'nova-violet',
	'crimson-surge'
];

export const READER_THEME_PRESETS: Record<ReaderThemePresetId, ReaderThemePreset> = {
	'vintage-amber': {
		id: 'vintage-amber',
		label: 'Vintage Amber',
		orp: '#E59885',
		lineAccent: '#E59885',
		swatchPrimary: '#E59885',
		swatchSecondary: '#3d2818'
	},
	'cyber-mint': {
		id: 'cyber-mint',
		label: 'Cyber Mint',
		orp: '#00f5a0',
		lineAccent: '#00d9f5',
		swatchPrimary: '#00f5a0',
		swatchSecondary: '#00d9f5'
	},
	'nova-violet': {
		id: 'nova-violet',
		label: 'Nova Violet',
		orp: '#9d7fff',
		lineAccent: '#7B51F8',
		swatchPrimary: '#9d7fff',
		swatchSecondary: '#7B51F8'
	},
	'crimson-surge': {
		id: 'crimson-surge',
		label: 'Crimson Surge',
		orp: '#ff5a1f',
		lineAccent: '#dd2476',
		swatchPrimary: '#ff5a1f',
		swatchSecondary: '#dd2476'
	}
};

export function isReaderThemePresetId(value: unknown): value is ReaderThemePresetId {
	return typeof value === 'string' && value in READER_THEME_PRESETS;
}
