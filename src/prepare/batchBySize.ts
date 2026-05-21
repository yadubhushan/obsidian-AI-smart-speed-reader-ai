import type { NormalizedDocumentBundle } from '../parse/normalizeTypes';
import type {
	LlmSectionsResponse,
	LlmStoryResponse,
	ProcessedSection
} from '../types/processedDocument';
import { bodyToStream } from './proseToStream';

export function needsBatching(
	bundle: NormalizedDocumentBundle,
	maxChars: number,
	maxLines?: number
): boolean {
	if (bundle.estimatedPayloadChars > maxChars) {
		return true;
	}
	if (
		maxLines !== undefined &&
		maxLines > 0 &&
		bundle.estimatedPayloadLines !== undefined &&
		bundle.estimatedPayloadLines > maxLines
	) {
		return true;
	}
	return false;
}

function estimateChunkPayloadChars(chunk: NormalizedDocumentBundle): number {
	return JSON.stringify(chunk).length;
}

/**
 * Split bundle into contiguous source-section chunks that fit under maxChars.
 * Never splits by arbitrary section count — only by size.
 */
export function splitBundleIntoChunks(
	bundle: NormalizedDocumentBundle,
	maxChars: number
): NormalizedDocumentBundle[] {
	if (!needsBatching(bundle, maxChars)) {
		return [bundle];
	}

	const chunks: NormalizedDocumentBundle[] = [];
	let currentSections: NormalizedDocumentBundle['sections'] = [];

	const flush = () => {
		if (currentSections.length === 0) {
			return;
		}
		const chunk: NormalizedDocumentBundle = {
			sourcePath: bundle.sourcePath,
			sourceChecksum: bundle.sourceChecksum,
			sections: currentSections,
			estimatedPayloadChars: 0,
			estimatedPayloadLines: 0
		};
		chunk.estimatedPayloadChars = estimateChunkPayloadChars(chunk);
		chunks.push(chunk);
		currentSections = [];
	};

	for (const section of bundle.sections) {
		const trial = [...currentSections, section];
		const trialBundle: NormalizedDocumentBundle = {
			sourcePath: bundle.sourcePath,
			sourceChecksum: bundle.sourceChecksum,
			sections: trial,
			estimatedPayloadChars: estimateChunkPayloadChars({
				sourcePath: bundle.sourcePath,
				sourceChecksum: bundle.sourceChecksum,
				sections: trial,
				estimatedPayloadChars: 0
			}),
			estimatedPayloadLines: 0
		};
		if (
			currentSections.length > 0 &&
			trialBundle.estimatedPayloadChars > maxChars
		) {
			flush();
			currentSections = [section];
		} else {
			currentSections = trial;
		}
	}
	flush();

	if (chunks.length === 0) {
		return [bundle];
	}
	return chunks;
}

export function slugifySectionTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48) || 'section';
}

export function assignSectionIds(
	sections: LlmSectionsResponse['sections']
): ProcessedSection[] {
	return sections.map((s, i) => {
		const ordinal = String(i + 1).padStart(2, '0');
		const slug = slugifySectionTitle(s.title);
		return {
			sectionId: `${ordinal}-${slug}`,
			title: s.title,
			stream: bodyToStream(s.body)
		};
	});
}

export function mergeSectionsResults(
	partials: LlmSectionsResponse[]
): LlmSectionsResponse {
	const allSections = partials.flatMap((p) => p.sections);
	return { sections: allSections };
}

export function mergeStoryResults(partials: LlmStoryResponse[]): LlmStoryResponse {
	const bodies = partials.map((p) => p.body.trim()).filter(Boolean);
	return { body: bodies.join('\n\n') };
}

export function bundleToUserPrompt(bundle: NormalizedDocumentBundle): string {
	return JSON.stringify(bundle, null, 2);
}
