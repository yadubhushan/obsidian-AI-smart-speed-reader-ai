import type { SourceFormatProcessor } from '../types/m2Contracts';

const processors: SourceFormatProcessor[] = [];

export function registerSourceFormatProcessor(processor: SourceFormatProcessor): void {
	processors.push(processor);
}

export function listSourceFormatProcessors(): SourceFormatProcessor[] {
	return [...processors];
}

export function getSourceFormatProcessorForPath(path: string): SourceFormatProcessor | null {
	for (const processor of processors) {
		if (processor.canProcess(path)) {
			return processor;
		}
	}
	return null;
}

export function getSourceFormatProcessor(formatId: string): SourceFormatProcessor | null {
	return processors.find((p) => p.formatId === formatId) ?? null;
}
