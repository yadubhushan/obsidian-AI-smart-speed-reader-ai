import { ensureParentFolderForFile } from '../utils/vaultAdapterDirs';

export interface LlmModelOption {
	id: string;
	label: string;
}

/** Shape of `llm-models.json` (editable under plugin `data/`). */
export interface LlmModelsConfigFile {
	default: string;
	models: LlmModelOption[];
}

export const LLM_MODELS_CONFIG_FILENAME = 'llm-models.json';

/** Built-in fallback when the config file is missing or invalid. */
export const BUILTIN_LLM_MODELS_CONFIG: LlmModelsConfigFile = {
	default: 'composer-2.5-fast',
	models: [
		{ id: 'composer-2.5-fast', label: 'Composer 2.5 Fast' },
		{ id: 'gpt-5.5-medium', label: 'GPT-5.5' },
		{ id: 'gpt-5.3-codex', label: 'Codex 5.3' },
		{ id: 'claude-4.6-sonnet-medium', label: 'Sonnet 4.6' },
		{ id: 'claude-opus-4-7-medium', label: 'Opus 4.7' },
		{ id: 'claude-4.5-opus-high', label: 'Opus 4.5' },
		{ id: 'gpt-5.2-xhigh', label: 'GPT-5.2 Extra High' },
		{ id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' }
	]
};

export class LlmModelCatalog {
	readonly options: readonly LlmModelOption[];
	readonly defaultModelId: string;

	private readonly knownIds: Set<string>;

	constructor(config: LlmModelsConfigFile) {
		this.options = Object.freeze([...config.models]);
		this.defaultModelId = config.default;
		this.knownIds = new Set(this.options.map((o) => o.id));
	}

	normalize(value: unknown): string {
		if (typeof value === 'string') {
			const trimmed = value.trim();
			if (this.knownIds.has(trimmed)) {
				return trimmed;
			}
		}
		if (this.knownIds.has(this.defaultModelId)) {
			return this.defaultModelId;
		}
		return this.options[0]?.id ?? BUILTIN_LLM_MODELS_CONFIG.default;
	}

	labelFor(modelId: string): string {
		const hit = this.options.find((o) => o.id === modelId);
		return hit?.label ?? modelId;
	}
}

function isRecord(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function parseModelEntry(raw: unknown): LlmModelOption | null {
	if (!isRecord(raw)) {
		return null;
	}
	const id = typeof raw.id === 'string' ? raw.id.trim() : '';
	const label = typeof raw.label === 'string' ? raw.label.trim() : '';
	if (!id.length || !label.length) {
		return null;
	}
	return { id, label };
}

/** Parse config JSON; returns null if required fields are missing or invalid. */
export function parseLlmModelsConfig(raw: unknown): LlmModelCatalog | null {
	if (!isRecord(raw)) {
		return null;
	}
	const modelsRaw = raw.models;
	if (!Array.isArray(modelsRaw) || modelsRaw.length === 0) {
		return null;
	}
	const models: LlmModelOption[] = [];
	const seen = new Set<string>();
	for (const entry of modelsRaw) {
		const opt = parseModelEntry(entry);
		if (!opt || seen.has(opt.id)) {
			continue;
		}
		seen.add(opt.id);
		models.push(opt);
	}
	if (models.length === 0) {
		return null;
	}
	const defaultId =
		typeof raw.default === 'string' ? raw.default.trim() : '';
	const defaultModelId = seen.has(defaultId)
		? defaultId
		: models[0]!.id;
	return new LlmModelCatalog({ default: defaultModelId, models });
}

export function createDefaultLlmModelCatalog(): LlmModelCatalog {
	return new LlmModelCatalog(BUILTIN_LLM_MODELS_CONFIG);
}

export function pluginLlmModelsConfigPath(
	vaultConfigDir: string,
	pluginId: string
): string {
	return [vaultConfigDir, 'plugins', pluginId, 'data', LLM_MODELS_CONFIG_FILENAME]
		.join('/')
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/');
}

/** Pre-data-folder location; migrated on load when present. */
export function legacyPluginLlmModelsConfigPath(
	vaultConfigDir: string,
	pluginId: string
): string {
	return [vaultConfigDir, 'plugins', pluginId, LLM_MODELS_CONFIG_FILENAME]
		.join('/')
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/');
}

/**
 * Ensures user model config lives under `data/`. Copies from legacy plugin-root path once if needed.
 * Returns the active config path.
 */
export async function migrateLlmModelsConfigIfNeeded(
	adapter: DataAdapterLike,
	vaultConfigDir: string,
	pluginId: string
): Promise<string> {
	const dataPath = pluginLlmModelsConfigPath(vaultConfigDir, pluginId);
	if (await adapter.exists(dataPath)) {
		return dataPath;
	}

	const legacyPath = legacyPluginLlmModelsConfigPath(vaultConfigDir, pluginId);
	if (await adapter.exists(legacyPath)) {
		const text = await adapter.read(legacyPath);
		await ensureParentFolderForFile(adapter, dataPath);
		await adapter.write(dataPath, text);
	}

	return dataPath;
}

export function serializeLlmModelsConfig(config: LlmModelsConfigFile): string {
	return `${JSON.stringify(config, null, 2)}\n`;
}

export interface DataAdapterLike {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	mkdir(path: string): Promise<void>;
}

export async function ensureLlmModelsConfigFile(
	adapter: DataAdapterLike,
	configPath: string,
	template: LlmModelsConfigFile = BUILTIN_LLM_MODELS_CONFIG
): Promise<void> {
	if (await adapter.exists(configPath)) {
		return;
	}
	await ensureParentFolderForFile(adapter, configPath);
	await adapter.write(configPath, serializeLlmModelsConfig(template));
}

export async function loadLlmModelCatalogFromPath(
	adapter: DataAdapterLike,
	configPath: string
): Promise<LlmModelCatalog> {
	try {
		if (!(await adapter.exists(configPath))) {
			return createDefaultLlmModelCatalog();
		}
		const text = await adapter.read(configPath);
		const parsed: unknown = JSON.parse(text);
		return parseLlmModelsConfig(parsed) ?? createDefaultLlmModelCatalog();
	} catch {
		return createDefaultLlmModelCatalog();
	}
}
