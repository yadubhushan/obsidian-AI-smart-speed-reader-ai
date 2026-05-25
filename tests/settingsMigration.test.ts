import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types';
import { createDefaultLlmModelCatalog } from '../src/llm/llmModelCatalog';
import { migrateFlatSettings, validateSettings } from '../src/services/settingsValidator';

const defaultCatalog = createDefaultLlmModelCatalog();

describe('migrateFlatSettings', () => {
	it('maps legacy flat data.json into nested groups', () => {
		const migrated = migrateFlatSettings({
			wpm: 350,
			fontSize: 96,
			chunkSize: 2,
			colorScheme: 'light',
			showContext: false,
			llmBackend: 'cursor-cli',
			cursorCliPath: '/usr/local/bin/cursor',
			llmModel: 'composer-2.5-fast',
			enableWordLookup: false
		});

		expect(migrated.reader?.wpm).toBe(350);
		expect(migrated.reader?.fontSize).toBe(96);
		expect(migrated.reader?.chunkSize).toBe(2);
		expect(migrated.reader?.colorScheme).toBe('light');
		expect(migrated.reader?.display?.showContext).toBe(false);
		expect(migrated.ai?.llmBackend).toBe('cursor-cli');
		expect(migrated.ai?.cursorCliPath).toBe('/usr/local/bin/cursor');
		expect(migrated.dictionary?.enableWordLookup).toBe(false);
	});

	it('passes through already-nested input unchanged', () => {
		const nested = {
			reader: { ...DEFAULT_SETTINGS.reader, wpm: 400 },
			ai: DEFAULT_SETTINGS.ai,
			bookmarks: DEFAULT_SETTINGS.bookmarks,
			dictionary: DEFAULT_SETTINGS.dictionary
		};
		const migrated = migrateFlatSettings(nested);
		expect(migrated).toEqual(nested);
	});

	it('validateSettings produces full nested defaults for empty input', () => {
		expect(validateSettings(null, defaultCatalog)).toEqual(DEFAULT_SETTINGS);
	});

	it('clamps contextLineFontSize to 12–32', () => {
		const low = validateSettings(
			{ reader: { ...DEFAULT_SETTINGS.reader, contextLineFontSize: 8 } },
			defaultCatalog
		);
		expect(low.reader.contextLineFontSize).toBe(12);
		const high = validateSettings(
			{ reader: { ...DEFAULT_SETTINGS.reader, contextLineFontSize: 48 } },
			defaultCatalog
		);
		expect(high.reader.contextLineFontSize).toBe(32);
	});

	it('validateSettings merges flat legacy fields via migration', () => {
		const result = validateSettings({ wpm: 99999, chunkSize: 0 }, defaultCatalog);
		expect(result.reader.wpm).toBe(5000);
		expect(result.reader.chunkSize).toBe(1);
	});

	it('preserves valid defaultPlaybackMode values and migrates unknown to rsvp', () => {
		expect(
			validateSettings(
				{ reader: { ...DEFAULT_SETTINGS.reader, defaultPlaybackMode: 'rsvp' } },
				defaultCatalog
			).reader.defaultPlaybackMode
		).toBe('rsvp');
		expect(
			validateSettings(
				{ reader: { ...DEFAULT_SETTINGS.reader, defaultPlaybackMode: 'lineRepeat' } },
				defaultCatalog
			).reader.defaultPlaybackMode
		).toBe('lineRepeat');
		expect(
			validateSettings(
				{ reader: { ...DEFAULT_SETTINGS.reader, defaultPlaybackMode: 'progressiveRsvp' } },
				defaultCatalog
			).reader.defaultPlaybackMode
		).toBe('progressiveRsvp');
		expect(
			validateSettings(
				{ reader: { ...DEFAULT_SETTINGS.reader, defaultPlaybackMode: 'lineByLine' } },
				defaultCatalog
			).reader.defaultPlaybackMode
		).toBe('lineByLine');
		expect(
			validateSettings(
				{ reader: { ...DEFAULT_SETTINGS.reader, defaultPlaybackMode: 'invalid' as never } },
				defaultCatalog
			).reader.defaultPlaybackMode
		).toBe('rsvp');
	});

	it('defaults progressiveRsvpMaxWordLength to 4 and clamps out-of-range values', () => {
		expect(validateSettings(null, defaultCatalog).reader.progressiveRsvpMaxWordLength).toBe(4);
		expect(
			validateSettings(
				{ reader: { ...DEFAULT_SETTINGS.reader, progressiveRsvpMaxWordLength: 5 } },
				defaultCatalog
			).reader.progressiveRsvpMaxWordLength
		).toBe(5);
		expect(
			validateSettings(
				{ reader: { ...DEFAULT_SETTINGS.reader, progressiveRsvpMaxWordLength: 0 } },
				defaultCatalog
			).reader.progressiveRsvpMaxWordLength
		).toBe(1);
		expect(
			validateSettings(
				{ reader: { ...DEFAULT_SETTINGS.reader, progressiveRsvpMaxWordLength: 99 } },
				defaultCatalog
			).reader.progressiveRsvpMaxWordLength
		).toBe(20);
	});
});
