import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
	BUILTIN_LLM_MODELS_CONFIG,
	createDefaultLlmModelCatalog,
	migrateLlmModelsConfigIfNeeded,
	parseLlmModelsConfig,
	pluginLlmModelsConfigPath,
	serializeLlmModelsConfig
} from '../src/llm/llmModelCatalog';

const repoConfigPath = join(process.cwd(), 'config/llm-models.json');

describe('llmModelCatalog', () => {
	it('parses the shipped llm-models.json config file', () => {
		const raw = JSON.parse(readFileSync(repoConfigPath, 'utf8')) as unknown;
		const catalog = parseLlmModelsConfig(raw);
		expect(catalog).not.toBeNull();
		if (!catalog) {
			throw new Error('expected catalog');
		}
		expect(catalog.options.map((o) => o.label)).toEqual([
			'Composer 2.5 Fast',
			'GPT-5.5',
			'Codex 5.3',
			'Sonnet 4.6',
			'Opus 4.7',
			'Opus 4.5',
			'GPT-5.2 Extra High',
			'Gemini 3.1 Pro'
		]);
		expect(catalog.defaultModelId).toBe('composer-2.5-fast');
	});

	it('defaults unknown values to the config default model', () => {
		const catalog = createDefaultLlmModelCatalog();
		expect(catalog.normalize(undefined)).toBe(BUILTIN_LLM_MODELS_CONFIG.default);
		expect(catalog.normalize('bogus')).toBe(BUILTIN_LLM_MODELS_CONFIG.default);
		expect(catalog.normalize('gemini-3.1-pro')).toBe('gemini-3.1-pro');
	});

	it('labels known ids and passes through unknown ids', () => {
		const catalog = createDefaultLlmModelCatalog();
		expect(catalog.labelFor('gpt-5.2-xhigh')).toBe('GPT-5.2 Extra High');
		expect(catalog.labelFor('custom')).toBe('custom');
	});

	it('rejects empty or duplicate model lists', () => {
		expect(parseLlmModelsConfig(null)).toBeNull();
		expect(parseLlmModelsConfig({ default: 'a', models: [] })).toBeNull();
		expect(
			parseLlmModelsConfig({
				default: 'a',
				models: [
					{ id: 'a', label: 'A' },
					{ id: 'a', label: 'A dup' },
					{ id: 'b', label: 'B' }
				]
			})?.options.map((o) => o.id)
		).toEqual(['a', 'b']);
	});

	it('stores user model config under plugin data/', () => {
		expect(pluginLlmModelsConfigPath('/vault/.obsidian', 'speed-reader-ai')).toBe(
			'/vault/.obsidian/plugins/speed-reader-ai/data/llm-models.json'
		);
	});

	it('migrates legacy plugin-root llm-models.json into data/', async () => {
		const files = new Map<string, string>();
		const adapter = {
			async exists(path: string) {
				return files.has(path);
			},
			async read(path: string) {
				const hit = files.get(path);
				if (hit === undefined) throw new Error(`missing ${path}`);
				return hit;
			},
			async write(path: string, data: string) {
				files.set(path, data);
			},
			async mkdir(_path: string) {
				/* no-op for in-memory test */
			}
		};

		const legacyPath = '/vault/.obsidian/plugins/speed-reader-ai/llm-models.json';
		const dataPath = pluginLlmModelsConfigPath('/vault/.obsidian', 'speed-reader-ai');
		const custom = serializeLlmModelsConfig({
			default: 'custom-model',
			models: [{ id: 'custom-model', label: 'Custom' }]
		});
		files.set(legacyPath, custom);

		const resolved = await migrateLlmModelsConfigIfNeeded(
			adapter,
			'/vault/.obsidian',
			'speed-reader-ai'
		);

		expect(resolved).toBe(dataPath);
		expect(files.get(dataPath)).toBe(custom);
	});
});
