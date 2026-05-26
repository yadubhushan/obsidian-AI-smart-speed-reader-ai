import { describe, expect, it } from 'vitest';
import { createDefaultLlmModelCatalog } from '../src/llm/llmModelCatalog';
import {
	pluginDataFromSettings,
	readingStateSyncFromPluginData,
	settingsFromPluginData
} from '../src/store/pluginDataStorage';
import { DEFAULT_SETTINGS } from '../src/types';

describe('pluginDataStorage', () => {
	const catalog = createDefaultLlmModelCatalog();

	it('loads flat legacy data.json as settings', () => {
		const settings = settingsFromPluginData(
			{ reader: { wpm: 500 } },
			catalog
		);
		expect(settings.reader.wpm).toBe(500);
	});

	it('loads wrapped schemaVersion payload', () => {
		const settings = settingsFromPluginData(
			{
				schemaVersion: 1,
				settings: { reader: { wpm: 420 } }
			},
			catalog
		);
		expect(settings.reader.wpm).toBe(420);
	});

	it('serializes settings with schemaVersion', () => {
		const payload = pluginDataFromSettings(DEFAULT_SETTINGS);
		expect(payload.schemaVersion).toBe(1);
		expect(payload.settings.reader.wpm).toBe(DEFAULT_SETTINGS.reader.wpm);
	});

	it('loads and serializes readingStateSync stamp', () => {
		const stamp = { revision: 3, updatedAt: '2026-05-26T00:00:00.000Z' };
		const raw = {
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
			readingStateSync: stamp
		};
		expect(readingStateSyncFromPluginData(raw)).toEqual(stamp);
		expect(pluginDataFromSettings(DEFAULT_SETTINGS, stamp).readingStateSync).toEqual(stamp);
	});
});
