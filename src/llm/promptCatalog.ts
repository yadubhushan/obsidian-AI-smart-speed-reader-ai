import batchChunkSuffixTxt from '../../config/prompts/batch-chunk-suffix.txt';
import prepareSectionsTxt from '../../config/prompts/prepare-sections.txt';
import prepareSingleStoryTxt from '../../config/prompts/prepare-single-story.txt';

export const PROMPTS_DIR_NAME = 'prompts';

export const PREPARE_SECTIONS_FILENAME = 'prepare-sections.txt';
export const PREPARE_SINGLE_STORY_FILENAME = 'prepare-single-story.txt';
export const BATCH_CHUNK_SUFFIX_FILENAME = 'batch-chunk-suffix.txt';

export const PREPARE_PROMPT_FILENAMES = [
	PREPARE_SECTIONS_FILENAME,
	PREPARE_SINGLE_STORY_FILENAME,
	BATCH_CHUNK_SUFFIX_FILENAME
] as const;

export type PreparePromptFilename = (typeof PREPARE_PROMPT_FILENAMES)[number];

export const PREPARE_PROMPTS_MISSING_MESSAGE =
	'Prepare prompts missing. Run `npm run build` in speed-reader-ai or copy `config/prompts/*.txt` to `.obsidian/plugins/speed-reader-ai/data/prompts/`.';

/** Shipped defaults bundled at build time from `config/prompts/`. */
export const BUILTIN_PREPARE_PROMPT_TEMPLATES: Record<PreparePromptFilename, string> = {
	[PREPARE_SECTIONS_FILENAME]: prepareSectionsTxt,
	[PREPARE_SINGLE_STORY_FILENAME]: prepareSingleStoryTxt,
	[BATCH_CHUNK_SUFFIX_FILENAME]: batchChunkSuffixTxt
};

export interface PreparePromptSet {
	sections: string;
	sectionsBatch: string;
	singleStory: string;
	singleStoryBatch: string;
}

export interface DataAdapterLike {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	mkdir(path: string): Promise<void>;
}

export function pluginPromptsDirPath(
	vaultConfigDir: string,
	pluginId: string
): string {
	return [vaultConfigDir, 'plugins', pluginId, 'data', PROMPTS_DIR_NAME]
		.join('/')
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/');
}

export function promptFilePath(dirPath: string, filename: PreparePromptFilename): string {
	const base = dirPath.replace(/\\/g, '/').replace(/\/+$/, '');
	return `${base}/${filename}`;
}

function composeBatchPrompt(base: string, suffix: string): string {
	return `${base.trim()}\n\n${suffix.trim()}`;
}

export function buildPreparePromptSet(
	sections: string,
	singleStory: string,
	batchChunkSuffix: string
): PreparePromptSet {
	const suffix = batchChunkSuffix.trim();
	return {
		sections: sections.trim(),
		sectionsBatch: composeBatchPrompt(sections, suffix),
		singleStory: singleStory.trim(),
		singleStoryBatch: composeBatchPrompt(singleStory, suffix)
	};
}

export async function allPreparePromptFilesExist(
	adapter: DataAdapterLike,
	dirPath: string
): Promise<boolean> {
	for (const filename of PREPARE_PROMPT_FILENAMES) {
		if (!(await adapter.exists(promptFilePath(dirPath, filename)))) {
			return false;
		}
	}
	return true;
}

export async function ensurePromptFiles(
	adapter: DataAdapterLike,
	dirPath: string,
	templates: Record<PreparePromptFilename, string>
): Promise<void> {
	await adapter.mkdir(dirPath);
	for (const filename of PREPARE_PROMPT_FILENAMES) {
		const path = promptFilePath(dirPath, filename);
		if (await adapter.exists(path)) {
			continue;
		}
		await adapter.write(path, templates[filename]);
	}
}

export async function loadPreparePromptSet(
	adapter: DataAdapterLike,
	dirPath: string
): Promise<PreparePromptSet> {
	if (!(await allPreparePromptFilesExist(adapter, dirPath))) {
		throw new Error(PREPARE_PROMPTS_MISSING_MESSAGE);
	}

	const sectionsPath = promptFilePath(dirPath, PREPARE_SECTIONS_FILENAME);
	const storyPath = promptFilePath(dirPath, PREPARE_SINGLE_STORY_FILENAME);
	const suffixPath = promptFilePath(dirPath, BATCH_CHUNK_SUFFIX_FILENAME);

	try {
		const [sections, singleStory, batchChunkSuffix] = await Promise.all([
			adapter.read(sectionsPath),
			adapter.read(storyPath),
			adapter.read(suffixPath)
		]);
		return buildPreparePromptSet(sections, singleStory, batchChunkSuffix);
	} catch {
		throw new Error(PREPARE_PROMPTS_MISSING_MESSAGE);
	}
}

/** Seeds missing `data/prompts/*.txt` from bundled defaults (no package readFileSync). */
export async function ensurePreparePromptFiles(
	adapter: DataAdapterLike,
	dirPath: string
): Promise<void> {
	if (await allPreparePromptFilesExist(adapter, dirPath)) {
		return;
	}
	await ensurePromptFiles(adapter, dirPath, BUILTIN_PREPARE_PROMPT_TEMPLATES);
}
