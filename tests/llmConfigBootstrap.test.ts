import { describe, expect, it } from 'vitest';
import { bootstrapLlmConfig } from '../src/boot/llmConfigBootstrap';
import {
	BUILTIN_LLM_MODELS_CONFIG,
	pluginLlmModelsConfigPath,
	serializeLlmModelsConfig,
	type DataAdapterLike
} from '../src/llm/llmModelCatalog';
import {
	PREPARE_PROMPT_FILENAMES,
	PREPARE_SECTIONS_FILENAME,
	pluginPromptsDirPath,
	promptFilePath
} from '../src/llm/promptCatalog';

const CONFIG_DIR = '.obsidian';
const PLUGIN_ID = 'speed-reader-ai';

function createMemoryAdapter(): DataAdapterLike & { files: Map<string, string> } {
	const files = new Map<string, string>();
	return {
		files,
		async exists(path: string): Promise<boolean> {
			return files.has(path);
		},
		async read(path: string): Promise<string> {
			const hit = files.get(path);
			if (hit === undefined) {
				throw new Error(`ENOENT: ${path}`);
			}
			return hit;
		},
		async write(path: string, data: string): Promise<void> {
			files.set(path, data);
		},
		async mkdir(): Promise<void> {
			// no-op for in-memory adapter
		}
	};
}

describe('bootstrapLlmConfig', () => {
	it('creates default model config and prompt files when none exist', async () => {
		const adapter = createMemoryAdapter();

		const state = await bootstrapLlmConfig(adapter, CONFIG_DIR, PLUGIN_ID);

		expect(state.llmModelsConfigPath).toBe(pluginLlmModelsConfigPath(CONFIG_DIR, PLUGIN_ID));
		expect(adapter.files.has(state.llmModelsConfigPath)).toBe(true);
		expect(state.llmModelCatalog.defaultModelId).toBe(BUILTIN_LLM_MODELS_CONFIG.default);

		expect(state.preparePromptsDirPath).toBe(pluginPromptsDirPath(CONFIG_DIR, PLUGIN_ID));
		for (const filename of PREPARE_PROMPT_FILENAMES) {
			expect(adapter.files.has(promptFilePath(state.preparePromptsDirPath, filename))).toBe(
				true
			);
		}
		expect(state.preparePrompts.sections.length).toBeGreaterThan(0);
		expect(state.preparePrompts.singleStory.length).toBeGreaterThan(0);
	});

	it('loads an existing user-edited model catalog instead of overwriting it', async () => {
		const adapter = createMemoryAdapter();
		const configPath = pluginLlmModelsConfigPath(CONFIG_DIR, PLUGIN_ID);
		const custom = {
			default: 'my-model',
			models: [{ id: 'my-model', label: 'My Model' }]
		};
		adapter.files.set(configPath, JSON.stringify(custom));

		const state = await bootstrapLlmConfig(adapter, CONFIG_DIR, PLUGIN_ID);

		expect(state.llmModelCatalog.defaultModelId).toBe('my-model');
		expect(state.llmModelCatalog.normalize('unknown')).toBe('my-model');
		expect(adapter.files.get(configPath)).toBe(JSON.stringify(custom));
	});

	it('migrates a legacy plugin-root config into the data folder', async () => {
		const adapter = createMemoryAdapter();
		const legacyPath = `${CONFIG_DIR}/plugins/${PLUGIN_ID}/llm-models.json`;
		const custom = serializeLlmModelsConfig({
			default: 'legacy-model',
			models: [{ id: 'legacy-model', label: 'Legacy Model' }]
		});
		adapter.files.set(legacyPath, custom);

		const state = await bootstrapLlmConfig(adapter, CONFIG_DIR, PLUGIN_ID);

		expect(state.llmModelsConfigPath).toBe(pluginLlmModelsConfigPath(CONFIG_DIR, PLUGIN_ID));
		expect(state.llmModelCatalog.defaultModelId).toBe('legacy-model');
	});

	it('preserves user-edited prompt files', async () => {
		const adapter = createMemoryAdapter();
		const dirPath = pluginPromptsDirPath(CONFIG_DIR, PLUGIN_ID);
		const customSections = 'my custom sections prompt';
		adapter.files.set(promptFilePath(dirPath, PREPARE_SECTIONS_FILENAME), customSections);

		const state = await bootstrapLlmConfig(adapter, CONFIG_DIR, PLUGIN_ID);

		expect(state.preparePrompts.sections).toBe(customSections);
	});
});
