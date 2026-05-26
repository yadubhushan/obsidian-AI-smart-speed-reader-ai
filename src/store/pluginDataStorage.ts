import type { SpeedReaderAiSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { validateSettings } from '../services/settingsValidator';
import type { LlmModelCatalog } from '../llm/llmModelCatalog';

export const PLUGIN_DATA_SCHEMA_VERSION = 1;

export interface ReadingStateSyncStamp {
	revision: number;
	updatedAt: string;
}

export interface SpeedReaderPluginData {
	schemaVersion: number;
	settings: SpeedReaderAiSettings;
	readingStateSync?: ReadingStateSyncStamp;
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

export function readingStateSyncFromPluginData(raw: unknown): ReadingStateSyncStamp | undefined {
	if (!isRecord(raw)) {
		return undefined;
	}
	const sync = raw.readingStateSync;
	if (!isRecord(sync)) {
		return undefined;
	}
	if (typeof sync.revision !== 'number' || typeof sync.updatedAt !== 'string') {
		return undefined;
	}
	return { revision: sync.revision, updatedAt: sync.updatedAt };
}

export function pluginDataFromSettings(
	settings: SpeedReaderAiSettings,
	readingStateSync?: ReadingStateSyncStamp
): SpeedReaderPluginData {
	return {
		schemaVersion: PLUGIN_DATA_SCHEMA_VERSION,
		settings,
		...(readingStateSync ? { readingStateSync } : {})
	};
}
