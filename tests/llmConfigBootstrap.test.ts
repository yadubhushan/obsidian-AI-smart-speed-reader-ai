import { describe, expect, it } from 'vitest';
import { bootstrapLlmConfig } from '../src/boot/llmConfigBootstrap';
import {
	type DataAdapterLike,
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
	it('creates default prompt files when none exist', async () => {
		const adapter = createMemoryAdapter();

		const state = await bootstrapLlmConfig(adapter, CONFIG_DIR, PLUGIN_ID);

		expect(state.preparePromptsDirPath).toBe(pluginPromptsDirPath(CONFIG_DIR, PLUGIN_ID));
		for (const filename of PREPARE_PROMPT_FILENAMES) {
			expect(adapter.files.has(promptFilePath(state.preparePromptsDirPath, filename))).toBe(
				true
			);
		}
		expect(state.preparePrompts.sections.length).toBeGreaterThan(0);
		expect(state.preparePrompts.singleStory.length).toBeGreaterThan(0);
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
