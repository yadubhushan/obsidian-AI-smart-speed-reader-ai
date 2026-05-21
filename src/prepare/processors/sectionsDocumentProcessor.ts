import type { NormalizedDocumentBundle } from '../../parse/normalizeTypes';
import type {
	DocumentProcessor,
	ProcessedDocument,
	ProcessedDocumentMeta,
	ProcessorDeps,
	ReaderUxProfile
} from '../../types/processedDocument';
import {
	assignSectionIds,
	bundleToUserPrompt,
	mergeSectionsResults,
	needsBatching,
	splitBundleIntoChunks
} from '../batchBySize';
import { runLlmParseWithRetry } from '../../llm/structuredLlmJson';
import { parseLlmSectionsResponse } from '../validateProcessedDocument';

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

async function callSectionsLlm(
	deps: ProcessorDeps,
	systemPrompt: string,
	userPrompt: string
) {
	return runLlmParseWithRetry(deps.llm, {
		systemPrompt,
		userPrompt,
		parse: parseLlmSectionsResponse,
		failureMessage: 'Sections processor returned invalid JSON.'
	});
}

export class SectionsDocumentProcessor implements DocumentProcessor {
	readonly id = 'sections' as const;
	readonly label = 'Sections';

	getReaderUxProfile(): ReaderUxProfile {
		return {
			progressScope: 'section',
			sectionNav: true,
			interSectionPause: true,
			headingJumpInStream: true,
			arrowKeys: 'section',
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
			const response = await callSectionsLlm(
				deps,
				deps.prompts.sections,
				bundleToUserPrompt(input)
			);
			return {
				kind: 'sections',
				processorId: 'sections',
				meta: buildMeta(input, deps, 'single'),
				sections: assignSectionIds(response.sections)
			};
		}

		const chunks = splitBundleIntoChunks(input, maxChars);
		const partials = [];
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			if (!chunk) continue;
			deps.onPrepareProgress?.({ phase: 'batch', current: i + 1, total: chunks.length });
			const response = await callSectionsLlm(
				deps,
				deps.prompts.sectionsBatch,
				bundleToUserPrompt(chunk)
			);
			partials.push(response);
		}
		const merged = mergeSectionsResults(partials);
		return {
			kind: 'sections',
			processorId: 'sections',
			meta: buildMeta(input, deps, 'batched'),
			sections: assignSectionIds(merged.sections)
		};
	}
}
