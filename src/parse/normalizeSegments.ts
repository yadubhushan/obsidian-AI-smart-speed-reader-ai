import type { DocumentSegment, ParsedSegments } from './segmentTypes';
import type {
	NormalizedDocumentBundle,
	NormalizedSegment,
	SectionSegmentBundle
} from './normalizeTypes';

const HEADING_RE = /^(#{1,6})\s+/;
const CALLOUT_MARKER_RE = /^\[!(\w+)\]\s*(.*)$/;
const STANDALONE_EMBED_RE = /^!\[\[([^\]]+)\]\]\s*$/;
const STANDALONE_IMAGE_RE = /^!\[([^\]]*)\]\([^)]+\)\s*$/;
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;

const DEFAULT_IMAGE_PAUSE_MS = 800;
const DEFAULT_EMBED_PAUSE_MS = 1200;

const SKIP_KINDS = new Set<DocumentSegment['kind']>(['frontmatter', 'code_block']);

function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function splitTableCells(line: string): string[] {
	const trimmed = line.trim();
	const inner = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
	const withoutTrailing = inner.endsWith('|') ? inner.slice(0, -1) : inner;
	return withoutTrailing.split('|').map((cell) => collapseWhitespace(cell));
}

function trimTrailingEmptyColumns(cells: string[]): string[] {
	let end = cells.length;
	while (end > 0 && cells[end - 1] === '') {
		end--;
	}
	return cells.slice(0, end);
}

function alignRowToWidth(cells: string[], width: number): string[] {
	const row = cells.slice(0, width);
	while (row.length < width) {
		row.push('');
	}
	return row;
}

export function normalizeTableLines(lines: string[]): {
	headers: string[];
	rows: string[][];
} {
	if (lines.length === 0) {
		return { headers: [], rows: [] };
	}

	const headers = trimTrailingEmptyColumns(splitTableCells(lines[0] ?? ''));
	const width = headers.length;
	const rows: string[][] = [];

	for (let index = 2; index < lines.length; index++) {
		const cells = trimTrailingEmptyColumns(splitTableCells(lines[index] ?? ''));
		rows.push(alignRowToWidth(cells, width));
	}

	return { headers, rows };
}

function stripBlockquotePrefix(line: string): string {
	return line.replace(/^>\s?/, '');
}

export function normalizeCalloutLines(lines: string[]): { title?: string; body?: string } {
	if (lines.length === 0) {
		return {};
	}

	const stripped = lines.map(stripBlockquotePrefix);
	const first = stripped[0] ?? '';
	const calloutMatch = first.match(CALLOUT_MARKER_RE);
	const titleFromFirst = calloutMatch?.[2]?.trim() || first.trim();
	const bodyLines = stripped.slice(1).map((line) => line.trim()).filter(Boolean);
	const body = bodyLines.length > 0 ? bodyLines.join('\n') : undefined;

	return {
		title: titleFromFirst || undefined,
		body: body ? resolveLinksInText(body) : undefined
	};
}

export function resolveLinksInText(text: string): string {
	return text
		.replace(WIKILINK_RE, (_match, target: string, display?: string) =>
			(display ?? target).trim()
		)
		.replace(MARKDOWN_LINK_RE, (_match, anchor: string) => anchor.trim());
}

function headingTitle(segment: DocumentSegment): string {
	const line = segment.lines[0] ?? '';
	const match = line.match(HEADING_RE);
	const raw = match ? line.slice(match[0].length) : line;
	return resolveLinksInText(raw.trim());
}

function joinSegmentLines(segment: DocumentSegment): string {
	return segment.lines.join('\n');
}

function parseImageSegment(segment: DocumentSegment): Pick<
	NormalizedSegment,
	'imageAlt' | 'suggestedPauseMs'
> {
	const line = segment.lines[0] ?? '';
	const match = line.match(STANDALONE_IMAGE_RE);
	return {
		imageAlt: match?.[1]?.trim() || undefined,
		suggestedPauseMs: DEFAULT_IMAGE_PAUSE_MS
	};
}

function parseEmbedSegment(segment: DocumentSegment): Pick<
	NormalizedSegment,
	'embedTarget' | 'suggestedPauseMs'
> {
	const line = segment.lines[0] ?? '';
	const match = line.match(STANDALONE_EMBED_RE);
	return {
		embedTarget: match?.[1]?.trim() || undefined,
		suggestedPauseMs: DEFAULT_EMBED_PAUSE_MS
	};
}

export function normalizeSegment(
	segment: DocumentSegment,
	index: number
): NormalizedSegment {
	const base: NormalizedSegment = {
		index,
		kind: segment.kind
	};

	if (SKIP_KINDS.has(segment.kind)) {
		return { ...base, skip: true };
	}

	switch (segment.kind) {
		case 'heading':
			return {
				...base,
				title: headingTitle(segment),
				headingLevel: (segment.meta?.level as number | undefined) ?? 1
			};
		case 'table':
			return {
				...base,
				table: normalizeTableLines(segment.lines)
			};
		case 'callout': {
			const callout = normalizeCalloutLines(segment.lines);
			return {
				...base,
				title: callout.title,
				body: callout.body
			};
		}
		case 'image':
			return { ...base, ...parseImageSegment(segment) };
		case 'embed':
			return { ...base, ...parseEmbedSegment(segment) };
		case 'hr':
			return base;
		case 'paragraph':
		case 'list':
		case 'blockquote':
			return {
				...base,
				body: resolveLinksInText(joinSegmentLines(segment))
			};
		default:
			return base;
	}
}

function normalizeSectionSegments(
	parsed: ParsedSegments,
	segmentStart: number,
	segmentEnd: number
): NormalizedSegment[] {
	const segments: NormalizedSegment[] = [];
	let index = 0;

	for (let segmentIndex = segmentStart; segmentIndex < segmentEnd; segmentIndex++) {
		const segment = parsed.segments[segmentIndex];
		if (!segment) continue;
		segments.push(normalizeSegment(segment, index));
		index++;
	}

	return segments;
}

function finalizePayloadEstimates(
	bundle: Omit<NormalizedDocumentBundle, 'estimatedPayloadChars' | 'estimatedPayloadLines'> & {
		estimatedPayloadChars?: number;
		estimatedPayloadLines?: number;
	}
): NormalizedDocumentBundle {
	let estimatedPayloadChars = 0;
	let estimatedPayloadLines = 0;

	for (let iteration = 0; iteration < 4; iteration++) {
		const serialized = JSON.stringify({
			...bundle,
			estimatedPayloadChars,
			estimatedPayloadLines
		});
		const nextChars = serialized.length;
		const nextLines = serialized.split('\n').length;
		if (nextChars === estimatedPayloadChars && nextLines === estimatedPayloadLines) {
			break;
		}
		estimatedPayloadChars = nextChars;
		estimatedPayloadLines = nextLines;
	}

	return {
		...bundle,
		estimatedPayloadChars,
		estimatedPayloadLines
	};
}

export function normalizeDocument(
	parsed: ParsedSegments,
	sourcePath: string,
	sourceChecksum: string
): NormalizedDocumentBundle {
	const sections: SectionSegmentBundle[] = parsed.sections.map((section) => ({
		sectionId: section.id,
		title: section.title,
		level: section.level,
		order: section.order,
		segments: normalizeSectionSegments(
			parsed,
			section.segmentStart,
			section.segmentEnd
		)
	}));

	return finalizePayloadEstimates({
		sourcePath,
		sourceChecksum,
		sections
	});
}
