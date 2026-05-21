import type { NormalizedDocumentBundle, NormalizedSegment } from '../parse/normalizeTypes';
import type { ParsedSegments } from '../parse/segmentTypes';
import { getSectionForEditorOffset } from '../parse/segmentParser';
import type {
	ProcessedDocument,
	ProcessedDocumentMeta,
	StreamToken
} from '../types/processedDocument';
import { proseToWordTokens } from './proseToStream';

function tableToWordTokens(table: { headers: string[]; rows: string[][] }): StreamToken[] {
	const tokens: StreamToken[] = [];
	if (table.headers.length > 0) {
		tokens.push(...proseToWordTokens(table.headers.join(' ')));
	}
	for (const row of table.rows) {
		if (row.length > 0) {
			tokens.push(...proseToWordTokens(row.join(' ')));
		}
	}
	return tokens;
}

export function segmentsToStream(segments: NormalizedSegment[]): StreamToken[] {
	const stream: StreamToken[] = [];

	for (const segment of segments) {
		if (segment.skip) {
			continue;
		}

		switch (segment.kind) {
			case 'heading':
				break;
			case 'paragraph':
			case 'list':
			case 'blockquote':
				if (segment.body) {
					stream.push(...proseToWordTokens(segment.body));
				}
				break;
			case 'callout':
				if (segment.title) {
					stream.push(...proseToWordTokens(segment.title));
				}
				if (segment.body) {
					stream.push(...proseToWordTokens(segment.body));
				}
				break;
			case 'table':
				if (segment.table) {
					stream.push(...tableToWordTokens(segment.table));
				}
				break;
			case 'image':
				stream.push({
					kind: 'image',
					alt: segment.imageAlt?.trim() || 'Image'
				});
				break;
			case 'embed':
				stream.push({
					kind: 'pause',
					pauseMs: segment.suggestedPauseMs ?? 1200
				});
				break;
			case 'hr':
				stream.push({ kind: 'pause', pauseMs: 400 });
				break;
			default:
				break;
		}
	}

	return stream;
}

function buildMeta(bundle: NormalizedDocumentBundle): ProcessedDocumentMeta {
	return {
		sourcePath: bundle.sourcePath,
		sourceChecksum: bundle.sourceChecksum,
		processedAt: new Date().toISOString(),
		model: 'deterministic',
		prepareStrategy: 'single'
	};
}

export function bundleToSectionsProcessed(bundle: NormalizedDocumentBundle): ProcessedDocument {
	return {
		kind: 'sections',
		processorId: 'sections',
		meta: buildMeta(bundle),
		sections: bundle.sections.map((section) => ({
			sectionId: section.sectionId,
			title: section.title,
			stream: segmentsToStream(section.segments)
		}))
	};
}

export function bundleToStoryProcessed(bundle: NormalizedDocumentBundle): ProcessedDocument {
	const stream: StreamToken[] = [];

	for (let i = 0; i < bundle.sections.length; i++) {
		const section = bundle.sections[i];
		if (!section) {
			continue;
		}
		if (i > 0) {
			stream.push({ kind: 'section_break', text: section.title });
		}
		stream.push(...segmentsToStream(section.segments));
	}

	return {
		kind: 'single_story',
		processorId: 'single_story',
		meta: buildMeta(bundle),
		stream
	};
}

/** Map editor offset to first stream token at or after the matching source section. */
export function findStoryTokenIndexForOffset(
	stream: StreamToken[],
	parsed: ParsedSegments,
	offset: number
): number {
	const match = getSectionForEditorOffset(parsed, offset);
	if (!match) {
		return 0;
	}

	const targetIndex = match.sectionIndex;
	if (targetIndex === 0) {
		return 0;
	}

	let sectionBreaksSeen = 0;
	for (let i = 0; i < stream.length; i++) {
		const token = stream[i];
		if (token?.kind === 'section_break') {
			sectionBreaksSeen++;
			if (sectionBreaksSeen === targetIndex) {
				return i;
			}
		}
	}

	return 0;
}
