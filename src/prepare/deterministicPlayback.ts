import type { NormalizedDocumentBundle, NormalizedSegment } from '../parse/normalizeTypes';
import type { ParsedSegments } from '../parse/segmentTypes';
import { getSectionForEditorOffset } from '../parse/segmentParser';
import type {
	ProcessedDocument,
	ProcessedDocumentMeta,
	StreamToken
} from '../types/processedDocument';
import { stripMarkdown } from '../services/textParser';
import { proseToWordTokens } from './proseToStream';

const PROSE_PARAGRAPH_KINDS = new Set<NormalizedSegment['kind']>([
	'paragraph',
	'blockquote',
	'list'
]);

function markdownTextToWordTokens(text: string): StreamToken[] {
	return proseToWordTokens(stripMarkdown(text));
}

/** Word indices at the start of each prose paragraph segment in a section stream. */
export function paragraphStartsFromSegments(segments: NormalizedSegment[]): number[] {
	const starts: number[] = [];
	let wordIndex = 0;

	for (const segment of segments) {
		if (segment.skip || !PROSE_PARAGRAPH_KINDS.has(segment.kind)) {
			continue;
		}
		if (!segment.body?.trim()) {
			continue;
		}
		const tokens = markdownTextToWordTokens(segment.body);
		if (tokens.length === 0) {
			continue;
		}
		starts.push(wordIndex);
		wordIndex += tokens.length;
	}

	return starts.length > 0 ? starts : [0];
}

function tableToWordTokens(table: { headers: string[]; rows: string[][] }): StreamToken[] {
	const tokens: StreamToken[] = [];
	if (table.headers.length > 0) {
		tokens.push(...markdownTextToWordTokens(table.headers.join(' ')));
	}
	for (const row of table.rows) {
		if (row.length > 0) {
			tokens.push(...markdownTextToWordTokens(row.join(' ')));
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
					stream.push(...markdownTextToWordTokens(segment.body));
				}
				break;
			case 'callout':
				if (segment.title) {
					stream.push(...markdownTextToWordTokens(segment.title));
				}
				if (segment.body) {
					stream.push(...markdownTextToWordTokens(segment.body));
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
		sections: bundle.sections.map((section) => {
			const paragraphStarts = paragraphStartsFromSegments(section.segments);
			return {
				sectionId: section.sectionId,
				title: section.title,
				stream: segmentsToStream(section.segments),
				paragraphStarts
			};
		})
	};
}

export function bundleToStoryProcessed(bundle: NormalizedDocumentBundle): ProcessedDocument {
	const stream: StreamToken[] = [];
	const paragraphStarts: number[] = [];
	let wordOffset = 0;

	for (let i = 0; i < bundle.sections.length; i++) {
		const section = bundle.sections[i];
		if (!section) {
			continue;
		}
		if (i > 0) {
			stream.push({ kind: 'section_break', text: stripMarkdown(section.title) });
		}
		const sectionStarts = paragraphStartsFromSegments(section.segments);
		for (const start of sectionStarts) {
			paragraphStarts.push(wordOffset + start);
		}
		const sectionStream = segmentsToStream(section.segments);
		wordOffset += sectionStream.filter((t) => t.kind === 'word').length;
		stream.push(...sectionStream);
	}

	return {
		kind: 'single_story',
		processorId: 'single_story',
		meta: buildMeta(bundle),
		stream,
		paragraphStarts: paragraphStarts.length > 0 ? paragraphStarts : [0]
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
