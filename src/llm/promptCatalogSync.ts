import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	BATCH_CHUNK_SUFFIX_FILENAME,
	buildPreparePromptSet,
	PREPARE_SECTIONS_FILENAME,
	PREPARE_SINGLE_STORY_FILENAME,
	type PreparePromptSet
} from './promptCatalog';

/** Sync load for tests; reads a directory with the three prompt files. */
export function loadPreparePromptSetFromDirSync(dirPath: string): PreparePromptSet {
	const sections = readFileSync(join(dirPath, PREPARE_SECTIONS_FILENAME), 'utf8');
	const singleStory = readFileSync(join(dirPath, PREPARE_SINGLE_STORY_FILENAME), 'utf8');
	const batchChunkSuffix = readFileSync(
		join(dirPath, BATCH_CHUNK_SUFFIX_FILENAME),
		'utf8'
	);
	return buildPreparePromptSet(sections, singleStory, batchChunkSuffix);
}
