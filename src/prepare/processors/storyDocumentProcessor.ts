import type { NormalizedDocumentBundle } from '../../parse/normalizeTypes';
import type {
	DocumentProcessor,
	ProcessedDocument,
	ProcessedDocumentMeta,
	ProcessorDeps,
	ReaderUxProfile
} from '../../types/processedDocument';
import {
	bundleToUserPrompt,
	mergeStoryResults,
	needsBatching,
	splitBundleIntoChunks
} from '../batchBySize';
import { runLlmParseWithRetry } from '../../llm/structuredLlmJson';
import { bodyToStream } from '../proseToStream';
import { parseLlmStoryResponse } from '../validateProcessedDocument';

function buildMeta(
	bundle: NormalizedDocumentBundle,
	deps: ProcessorDeps,
	prepareStrategy: 'single' | 'batched'
): ProcessedDocumentMeta {
	return {
		sourcePath: bundle.sourcePath,
		sourceChecksum: bundle.sourceChecksum,
		processedAt: new Date().toISOString(),
		model: deps.settings.llmModel,
		prepareStrategy
	};
}

async function callStoryLlm(
	deps: ProcessorDeps,
	systemPrompt: string,
	userPrompt: string
) {
	return runLlmParseWithRetry(deps.llm, {
		systemPrompt,
		userPrompt,
		parse: parseLlmStoryResponse,
		failureMessage: 'Story processor returned invalid JSON.'
	});
}

export class StoryDocumentProcessor implements DocumentProcessor {
	readonly id = 'single_story' as const;
	readonly label = 'Single story';

	getReaderUxProfile(): ReaderUxProfile {
		return {
			progressScope: 'document',
			sectionNav: false,
			interSectionPause: false,
			headingJumpInStream: true,
			arrowKeys: 'wordSkip',
			wordSkipKeys: 'shift-arrows'
		};
	}

	async process(
		input: NormalizedDocumentBundle,
		deps: ProcessorDeps
	): Promise<ProcessedDocument> {
		const maxChars = deps.settings.prepareSingleCallMaxChars;
		const maxLines = deps.settings.prepareSingleCallMaxLines;
		const batched = needsBatching(input, maxChars, maxLines);

		if (!batched) {
			const response = await callStoryLlm(
				deps,
				deps.prompts.singleStory,
				bundleToUserPrompt(input)
			);
			return {
				kind: 'single_story',
				processorId: 'single_story',
				meta: buildMeta(input, deps, 'single'),
				stream: bodyToStream(response.body)
			};
		}

		const chunks = splitBundleIntoChunks(input, maxChars);
		const partials = [];
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			if (!chunk) continue;
			deps.onPrepareProgress?.({ phase: 'batch', current: i + 1, total: chunks.length });
			const response = await callStoryLlm(
				deps,
				deps.prompts.singleStoryBatch,
				bundleToUserPrompt(chunk)
			);
			partials.push(response);
		}
		const merged = mergeStoryResults(partials);
		return {
			kind: 'single_story',
			processorId: 'single_story',
			meta: buildMeta(input, deps, 'batched'),
			stream: bodyToStream(merged.body)
		};
	}
}
