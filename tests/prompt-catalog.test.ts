import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
	BATCH_CHUNK_SUFFIX_FILENAME,
	BUILTIN_PREPARE_PROMPT_TEMPLATES,
	buildPreparePromptSet,
	ensurePreparePromptFiles,
	loadPreparePromptSet,
	loadPreparePromptSetFromDirSync,
	PREPARE_PROMPTS_MISSING_MESSAGE,
	PREPARE_SECTIONS_FILENAME,
	PREPARE_SINGLE_STORY_FILENAME,
	type DataAdapterLike
} from '../src/llm/promptCatalog';

const CONFIG_PROMPTS_DIR = join(process.cwd(), 'config', 'prompts');

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
		async mkdir(_path: string): Promise<void> {
			// no-op for in-memory adapter
		}
	};
}

describe('promptCatalog', () => {
	it('loads non-empty prompts from config/prompts', () => {
		const prompts = loadPreparePromptSetFromDirSync(CONFIG_PROMPTS_DIR);
		expect(prompts.sections.length).toBeGreaterThan(100);
		expect(prompts.singleStory.length).toBeGreaterThan(100);
		expect(prompts.sectionsBatch.length).toBeGreaterThan(prompts.sections.length);
		expect(prompts.singleStoryBatch.length).toBeGreaterThan(prompts.singleStory.length);
	});

	it('composes batch prompts as base plus suffix', () => {
		const sections = readFileSync(
			join(CONFIG_PROMPTS_DIR, PREPARE_SECTIONS_FILENAME),
			'utf8'
		);
		const singleStory = readFileSync(
			join(CONFIG_PROMPTS_DIR, PREPARE_SINGLE_STORY_FILENAME),
			'utf8'
		);
		const suffix = readFileSync(
			join(CONFIG_PROMPTS_DIR, BATCH_CHUNK_SUFFIX_FILENAME),
			'utf8'
		);
		const prompts = buildPreparePromptSet(sections, singleStory, suffix);
		expect(prompts.sectionsBatch).toBe(
			`${sections.trim()}\n\n${suffix.trim()}`
		);
		expect(prompts.singleStoryBatch).toBe(
			`${singleStory.trim()}\n\n${suffix.trim()}`
		);
	});

	it('bundled defaults match config/prompts on disk', () => {
		const fromDisk = loadPreparePromptSetFromDirSync(CONFIG_PROMPTS_DIR);
		const fromBuiltin = buildPreparePromptSet(
			BUILTIN_PREPARE_PROMPT_TEMPLATES[PREPARE_SECTIONS_FILENAME],
			BUILTIN_PREPARE_PROMPT_TEMPLATES[PREPARE_SINGLE_STORY_FILENAME],
			BUILTIN_PREPARE_PROMPT_TEMPLATES[BATCH_CHUNK_SUFFIX_FILENAME]
		);
		expect(fromBuiltin).toEqual(fromDisk);
	});

	it('seeds missing prompt files from bundled defaults', async () => {
		const adapter = createMemoryAdapter();
		const dirPath = '.obsidian/plugins/speed-reader-ai/data/prompts';

		await ensurePreparePromptFiles(adapter, dirPath);

		const prompts = await loadPreparePromptSet(adapter, dirPath);
		expect(prompts.sections.length).toBeGreaterThan(100);
		expect(prompts.singleStory.length).toBeGreaterThan(100);
	});

	it('does not overwrite existing prompt files', async () => {
		const adapter = createMemoryAdapter();
		const dirPath = '.obsidian/plugins/speed-reader-ai/data/prompts';
		adapter.files.set(
			`${dirPath}/${PREPARE_SECTIONS_FILENAME}`,
			'custom sections prompt'
		);
		adapter.files.set(
			`${dirPath}/${PREPARE_SINGLE_STORY_FILENAME}`,
			'custom story prompt'
		);
		adapter.files.set(
			`${dirPath}/${BATCH_CHUNK_SUFFIX_FILENAME}`,
			'custom suffix'
		);

		await ensurePreparePromptFiles(adapter, dirPath);

		expect(adapter.files.get(`${dirPath}/${PREPARE_SECTIONS_FILENAME}`)).toBe(
			'custom sections prompt'
		);
	});

	it('loadPreparePromptSet throws a friendly error when files are missing', async () => {
		const adapter = createMemoryAdapter();
		await expect(
			loadPreparePromptSet(adapter, '.obsidian/plugins/speed-reader-ai/data/prompts')
		).rejects.toThrow(PREPARE_PROMPTS_MISSING_MESSAGE);
	});
});
