import type { App } from 'obsidian';
import type { LlmModelCatalog } from '../llm/llmModelCatalog';
import type { PreparePromptSet } from '../llm/promptCatalog';
import type { ManifestStore } from '../store/ManifestStore';
import type { SpeedReaderAiSettings } from '../types';

/** Minimal plugin surface for M2 service wiring (avoids main.ts circular import). */
export interface SpeedReaderPluginHost {
	app: App;
	settings: SpeedReaderAiSettings;
	llmModelCatalog: LlmModelCatalog;
	preparePrompts: PreparePromptSet;
	saveSettings(): Promise<void>;
	getManifestStore(): ManifestStore;
	onPrepareStatusChange?(): void;
}
