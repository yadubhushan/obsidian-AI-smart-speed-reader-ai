import {
	type DataAdapterLike,
	ensurePreparePromptFiles,
	loadPreparePromptSet,
	pluginPromptsDirPath,
	type PreparePromptSet
} from '../llm/promptCatalog';

export interface LlmConfigState {
	preparePromptsDirPath: string;
	preparePrompts: PreparePromptSet;
}

/** Ensures and loads the on-disk prepare prompt files. */
export async function bootstrapLlmConfig(
	adapter: DataAdapterLike,
	configDir: string,
	pluginId: string
): Promise<LlmConfigState> {
	const preparePromptsDirPath = pluginPromptsDirPath(configDir, pluginId);
	await ensurePreparePromptFiles(adapter, preparePromptsDirPath);
	const preparePrompts = await loadPreparePromptSet(adapter, preparePromptsDirPath);

	return { preparePromptsDirPath, preparePrompts };
}
