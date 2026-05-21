import type { NormalizedDocumentBundle } from '../parse/normalizeTypes';
import type {
	ProcessedDocument,
	ProcessingModeId,
	ProcessorDeps
} from '../types/processedDocument';
import { getDocumentProcessor } from './documentProcessorRegistry';

export async function processDocument(
	processorId: ProcessingModeId,
	bundle: NormalizedDocumentBundle,
	deps: ProcessorDeps
): Promise<ProcessedDocument> {
	return getDocumentProcessor(processorId).process(bundle, deps);
}

export { listDocumentProcessors, getDocumentProcessor } from './documentProcessorRegistry';
