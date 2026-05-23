import type { SpeedReaderAiSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { validateSettings } from '../services/settingsValidator';
import type { LlmModelCatalog } from '../llm/llmModelCatalog';

export const PLUGIN_DATA_SCHEMA_VERSION = 1;

export interface SpeedReaderPluginData {
	schemaVersion: number;
	settings: SpeedReaderAiSettings;
}

function isRecord(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isNestedPluginData(raw: unknown): raw is SpeedReaderPluginData {
	return (
		isRecord(raw) &&
		typeof raw.schemaVersion === 'number' &&
		isRecord(raw.settings)
	);
}

/** Load settings from raw `loadData()` payload (flat legacy or wrapped schema). */
export function settingsFromPluginData(
	raw: unknown,
	catalog: LlmModelCatalog
): SpeedReaderAiSettings {
	if (isNestedPluginData(raw)) {
		return validateSettings(Object.assign({}, DEFAULT_SETTINGS, raw.settings), catalog);
	}
	return validateSettings(Object.assign({}, DEFAULT_SETTINGS, raw), catalog);
}

export function pluginDataFromSettings(settings: SpeedReaderAiSettings): SpeedReaderPluginData {
	return {
		schemaVersion: PLUGIN_DATA_SCHEMA_VERSION,
		settings
	};
}
