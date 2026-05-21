import type { NormalizedDocumentBundle } from '../parse/normalizeTypes';

export type ProcessingModeId = 'sections' | 'single_story';

export type StreamTokenKind = 'word' | 'pause' | 'image' | 'section_break';

export interface StreamToken {
	kind: StreamTokenKind;
	text?: string;
	orpIndex?: number;
	alt?: string;
	pauseMs?: number;
}

export interface ProcessedDocumentMeta {
	sourcePath: string;
	sourceChecksum: string;
	processedAt: string;
	model: string;
	prepareStrategy: 'single' | 'batched';
}

export interface ProcessedSection {
	sectionId: string;
	title: string;
	stream: StreamToken[];
}

export type ProcessedDocument =
	| {
			kind: 'sections';
			processorId: 'sections';
			meta: ProcessedDocumentMeta;
			sections: ProcessedSection[];
	  }
	| {
			kind: 'single_story';
			processorId: 'single_story';
			meta: ProcessedDocumentMeta;
			stream: StreamToken[];
	  };

export interface ReaderUxProfile {
	progressScope: 'section' | 'document';
	sectionNav: boolean;
	interSectionPause: boolean;
	headingJumpInStream: boolean;
	arrowKeys: 'section' | 'wordSkip';
	wordSkipKeys: 'shift-arrows';
}

export interface PrepareProgressInfo {
	phase: 'batch';
	current: number;
	total: number;
}

export interface ProcessorDeps {
	llm: import('../llm/LlmClient').LlmClient;
	prompts: import('../llm/promptCatalog').PreparePromptSet;
	settings: Pick<
		import('../types').AiSettings,
		'prepareSingleCallMaxChars' | 'prepareSingleCallMaxLines' | 'llmModel'
	>;
	onPrepareProgress?: (info: PrepareProgressInfo) => void;
}

export interface DocumentProcessor {
	readonly id: ProcessingModeId;
	readonly label: string;
	process(
		input: NormalizedDocumentBundle,
		deps: ProcessorDeps
	): Promise<ProcessedDocument>;
	getReaderUxProfile(): ReaderUxProfile;
}

export type ModeCacheStatus = 'none' | 'ready' | 'stale' | 'error';

export interface ModeCacheEntry {
	status: ModeCacheStatus;
	preparedAt?: string;
	model?: string;
	sourceChecksum?: string;
}

export interface DocumentCacheIndex {
	version: 1;
	sourcePath: string;
	sourceChecksum: string;
	activeProcessingMode: ProcessingModeId;
	modes: Record<ProcessingModeId, ModeCacheEntry>;
	updatedAt: string;
}

export interface SectionIndexEntry {
	id: string;
	title: string;
	order: number;
	status: 'ready' | 'stale' | 'error';
}

export interface SectionsModeIndex {
	version: 1;
	sourcePath: string;
	sourceChecksum: string;
	preparedAt: string;
	prepareStrategy: 'single' | 'batched';
	model: string;
	sections: SectionIndexEntry[];
}

export interface SpeedReadSectionManifest {
	version: 1;
	sectionId: string;
	sourcePath: string;
	sourceChecksum: string;
	title: string;
	preparedAt: string;
	model: string;
	stream: StreamToken[];
}

export interface SingleStoryManifest {
	version: 1;
	sourcePath: string;
	sourceChecksum: string;
	preparedAt: string;
	prepareStrategy: 'single' | 'batched';
	model: string;
	stream: StreamToken[];
}

/** LLM JSON payload for sections processor. */
export interface LlmSectionsResponse {
	sections: Array<{ title: string; body: string }>;
}

/** LLM JSON payload for single_story processor. */
export interface LlmStoryResponse {
	body: string;
}
