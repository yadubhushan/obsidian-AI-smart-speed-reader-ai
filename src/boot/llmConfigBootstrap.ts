import type { DataAdapter } from 'obsidian';
import {
	ensureLlmModelsConfigFile,
	loadLlmModelCatalogFromPath,
	migrateLlmModelsConfigIfNeeded,
	type LlmModelCatalog
} from '../llm/llmModelCatalog';
import {
	ensurePreparePromptFiles,
	loadPreparePromptSet,
	pluginPromptsDirPath,
	type PreparePromptSet
} from '../llm/promptCatalog';

export interface LlmConfigState {
	llmModelsConfigPath: string;
	llmModelCatalog: LlmModelCatalog;
	preparePromptsDirPath: string;
	preparePrompts: PreparePromptSet;
}

/** Migrates, ensures, and loads the on-disk LLM model catalog and prepare prompt files. */
export async function bootstrapLlmConfig(
	adapter: DataAdapter,
	configDir: string,
	pluginId: string
): Promise<LlmConfigState> {
	const llmModelsConfigPath = await migrateLlmModelsConfigIfNeeded(adapter, configDir, pluginId);
	await ensureLlmModelsConfigFile(adapter, llmModelsConfigPath);
	const llmModelCatalog = await loadLlmModelCatalogFromPath(adapter, llmModelsConfigPath);

	const preparePromptsDirPath = pluginPromptsDirPath(configDir, pluginId);
	await ensurePreparePromptFiles(adapter, preparePromptsDirPath);
	const preparePrompts = await loadPreparePromptSet(adapter, preparePromptsDirPath);

	return { llmModelsConfigPath, llmModelCatalog, preparePromptsDirPath, preparePrompts };
}
