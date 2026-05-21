import type {
	DocumentProcessor,
	ProcessingModeId
} from '../types/processedDocument';
import { SectionsDocumentProcessor } from './processors/sectionsDocumentProcessor';
import { StoryDocumentProcessor } from './processors/storyDocumentProcessor';

const sectionsProcessor = new SectionsDocumentProcessor();
const storyProcessor = new StoryDocumentProcessor();

const REGISTRY: Record<ProcessingModeId, DocumentProcessor> = {
	sections: sectionsProcessor,
	single_story: storyProcessor
};

export function listDocumentProcessors(): DocumentProcessor[] {
	return [sectionsProcessor, storyProcessor];
}

export function getDocumentProcessor(id: ProcessingModeId): DocumentProcessor {
	const processor = REGISTRY[id];
	if (!processor) {
		throw new Error(`Unknown document processor: ${id}`);
	}
	return processor;
}

export { documentProcessorRegistry as default };

const documentProcessorRegistry = {
	list: listDocumentProcessors,
	get: getDocumentProcessor
};
