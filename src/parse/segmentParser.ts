import type { SpeedReaderAiSettings } from '../types';
import {
	DocumentSection,
	DocumentSegment,
	ParseSegmentsOptions,
	ParsedSegments
} from './segmentTypes';

const HEADING_RE = /^(#{1,6})\s+/;
const HR_RE = /^(\*{3,}|-{3,}|_{3,})\s*$/;
const CODE_FENCE_RE = /^(`{3,}|~{3,})/;
const TABLE_ROW_RE = /^\|.+\|/;
const TABLE_SEP_RE = /^\|[\s\-:|]+\|/;
const CALLOUT_RE = /^>\s*\[!(\w+)\]/;
const BLOCKQUOTE_RE = /^>\s?/;
const UNORDERED_LIST_RE = /^(\s*)[-*+]\s+/;
const ORDERED_LIST_RE = /^(\s*)\d+\.\s+/;
const STANDALONE_EMBED_RE = /^!\[\[[^\]]+\]\]\s*$/;
const STANDALONE_IMAGE_RE = /^!\[[^\]]*\]\([^)]+\)\s*$/;
const FRONTMATTER_START = /^---\s*$/;

interface LineInfo {
	line: string;
	start: number;
	end: number;
}

const ATX_H1_RE = /^#\s+(.*)$/;

function headingTitleFromLine(line: string): string | null {
	const match = line.match(ATX_H1_RE);
	return match ? (match[1] ?? '').trim() : null;
}

/** Truncate before first ATX H1 matching bookmark section heading (case-sensitive). */
function truncateBeforeBookmarkSection(
	lineInfos: LineInfo[],
	bookmarkSectionHeading: string | undefined
): LineInfo[] {
	if (!bookmarkSectionHeading) {
		return lineInfos;
	}

	for (let index = 0; index < lineInfos.length; index++) {
		const title = headingTitleFromLine(lineInfos[index]?.line ?? '');
		if (title === bookmarkSectionHeading) {
			return lineInfos.slice(0, index);
		}
	}

	return lineInfos;
}

function splitLinesWithOffsets(text: string): LineInfo[] {
	const lines: LineInfo[] = [];
	let offset = 0;
	const parts = text.split('\n');

	for (let index = 0; index < parts.length; index++) {
		const line = parts[index] ?? '';
		const start = offset;
		const hasTrailingNewline = index < parts.length - 1;
		offset += line.length + (hasTrailingNewline ? 1 : 0);
		lines.push({ line, start, end: offset });
	}

	return lines;
}

/** Body used for RSVP, AI prepare, and note checksum (bookmark section excluded). */
export function readableNoteBody(
	text: string,
	bookmarkSectionHeading: string | undefined
): string {
	const normalized = text.replace(/\r\n/g, '\n');
	const lineInfos = truncateBeforeBookmarkSection(
		splitLinesWithOffsets(normalized),
		bookmarkSectionHeading
	);
	return lineInfos.map((info) => info.line).join('\n');
}

function makeSegment(
	kind: DocumentSegment['kind'],
	lineInfos: LineInfo[],
	startIndex: number,
	endIndex: number,
	meta?: Record<string, unknown>
): DocumentSegment {
	const slice = lineInfos.slice(startIndex, endIndex);
	const first = slice[0];
	const last = slice[slice.length - 1];

	if (!first || !last) {
		throw new Error('Cannot create segment from empty line range');
	}

	return {
		kind,
		start: first.start,
		end: last.end,
		lines: slice.map((info) => info.line),
		meta
	};
}

function isTableStart(lineInfos: LineInfo[], index: number): boolean {
	const current = lineInfos[index];
	const next = lineInfos[index + 1];
	if (!current || !next) return false;
	return TABLE_ROW_RE.test(current.line) && TABLE_SEP_RE.test(next.line);
}

function isCalloutLine(line: string): boolean {
	return CALLOUT_RE.test(line);
}

function isBlockquoteLine(line: string): boolean {
	return BLOCKQUOTE_RE.test(line) && !CALLOUT_RE.test(line);
}

function isUnorderedListLine(line: string): boolean {
	return UNORDERED_LIST_RE.test(line);
}

function isOrderedListLine(line: string): boolean {
	return ORDERED_LIST_RE.test(line);
}

function parseFrontmatter(
	lineInfos: LineInfo[],
	startIndex: number
): { segment: DocumentSegment; nextIndex: number } {
	let endIndex = startIndex + 1;

	while (endIndex < lineInfos.length) {
		if (FRONTMATTER_START.test(lineInfos[endIndex]?.line ?? '')) {
			endIndex++;
			break;
		}
		endIndex++;
	}

	return {
		segment: makeSegment('frontmatter', lineInfos, startIndex, endIndex, {
			excluded: true
		}),
		nextIndex: endIndex
	};
}

function parseCodeBlock(
	lineInfos: LineInfo[],
	startIndex: number
): { segment: DocumentSegment; nextIndex: number } {
	const opener = lineInfos[startIndex]?.line.match(CODE_FENCE_RE)?.[1] ?? '```';
	let endIndex = startIndex + 1;

	while (endIndex < lineInfos.length) {
		const line = lineInfos[endIndex]?.line ?? '';
		if (line.startsWith(opener)) {
			endIndex++;
			break;
		}
		endIndex++;
	}

	return {
		segment: makeSegment('code_block', lineInfos, startIndex, endIndex),
		nextIndex: endIndex
	};
}

function parseTable(
	lineInfos: LineInfo[],
	startIndex: number
): { segment: DocumentSegment; nextIndex: number } {
	let endIndex = startIndex + 2;

	while (endIndex < lineInfos.length) {
		const line = lineInfos[endIndex]?.line ?? '';
		if (!TABLE_ROW_RE.test(line)) break;
		endIndex++;
	}

	return {
		segment: makeSegment('table', lineInfos, startIndex, endIndex),
		nextIndex: endIndex
	};
}

function parseCallout(
	lineInfos: LineInfo[],
	startIndex: number
): { segment: DocumentSegment; nextIndex: number } {
	const firstLine = lineInfos[startIndex]?.line ?? '';
	const calloutMatch = firstLine.match(CALLOUT_RE);
	const calloutType = calloutMatch?.[1] ?? 'note';
	let endIndex = startIndex + 1;

	while (endIndex < lineInfos.length) {
		const line = lineInfos[endIndex]?.line ?? '';
		if (line.trim() === '') break;
		if (!BLOCKQUOTE_RE.test(line)) break;
		endIndex++;
	}

	return {
		segment: makeSegment('callout', lineInfos, startIndex, endIndex, {
			calloutType
		}),
		nextIndex: endIndex
	};
}

function parseBlockquote(
	lineInfos: LineInfo[],
	startIndex: number
): { segment: DocumentSegment; nextIndex: number } {
	let endIndex = startIndex + 1;

	while (endIndex < lineInfos.length) {
		const line = lineInfos[endIndex]?.line ?? '';
		if (line.trim() === '') break;
		if (!BLOCKQUOTE_RE.test(line) || isCalloutLine(line)) break;
		endIndex++;
	}

	return {
		segment: makeSegment('blockquote', lineInfos, startIndex, endIndex),
		nextIndex: endIndex
	};
}

function parseList(
	lineInfos: LineInfo[],
	startIndex: number
): { segment: DocumentSegment; nextIndex: number } {
	const firstLine = lineInfos[startIndex]?.line ?? '';
	const ordered = isOrderedListLine(firstLine);
	let endIndex = startIndex + 1;

	while (endIndex < lineInfos.length) {
		const line = lineInfos[endIndex]?.line ?? '';
		if (line.trim() === '') break;
		if (ordered ? !isOrderedListLine(line) : !isUnorderedListLine(line)) break;
		endIndex++;
	}

	return {
		segment: makeSegment('list', lineInfos, startIndex, endIndex, { ordered }),
		nextIndex: endIndex
	};
}

function parseParagraph(
	lineInfos: LineInfo[],
	startIndex: number
): { segment: DocumentSegment; nextIndex: number } {
	let endIndex = startIndex + 1;

	while (endIndex < lineInfos.length) {
		const line = lineInfos[endIndex]?.line ?? '';
		if (line.trim() === '') break;
		if (
			HEADING_RE.test(line) ||
			HR_RE.test(line.trim()) ||
			CODE_FENCE_RE.test(line) ||
			isTableStart(lineInfos, endIndex) ||
			isCalloutLine(line) ||
			isBlockquoteLine(line) ||
			isUnorderedListLine(line) ||
			isOrderedListLine(line) ||
			STANDALONE_EMBED_RE.test(line) ||
			STANDALONE_IMAGE_RE.test(line)
		) {
			break;
		}
		endIndex++;
	}

	return {
		segment: makeSegment('paragraph', lineInfos, startIndex, endIndex),
		nextIndex: endIndex
	};
}

function isExcludedSegment(segment: DocumentSegment): boolean {
	return segment.kind === 'frontmatter' && segment.meta?.excluded === true;
}

function firstIncludedSegmentIndex(segments: DocumentSegment[]): number {
	for (let index = 0; index < segments.length; index++) {
		if (!isExcludedSegment(segments[index]!)) {
			return index;
		}
	}
	return segments.length;
}

function headingText(segment: DocumentSegment): string {
	const line = segment.lines[0] ?? '';
	const match = line.match(HEADING_RE);
	return match ? line.slice(match[0].length).trim() : line.trim();
}

function slugifyTitle(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return slug || 'section';
}

function uniqueSectionId(
	baseId: string,
	order: number,
	usedIds: Set<string>
): string {
	const orderPrefix = order < 10 ? `0${order}` : String(order);
	const prefixed = `${orderPrefix}-${baseId}`;
	if (!usedIds.has(prefixed)) {
		usedIds.add(prefixed);
		return prefixed;
	}

	let suffix = 2;
	while (usedIds.has(`${prefixed}-${suffix}`)) {
		suffix++;
	}
	const unique = `${prefixed}-${suffix}`;
	usedIds.add(unique);
	return unique;
}

function titleFromFileName(fileName?: string): string | null {
	if (!fileName) return null;
	const stem = fileName.replace(/\.[^.]+$/, '').trim();
	return stem || null;
}

function firstParagraphTitle(segments: DocumentSegment[]): string | null {
	for (const segment of segments) {
		if (isExcludedSegment(segment)) continue;
		if (segment.kind !== 'paragraph') continue;
		const line = segment.lines[0]?.trim() ?? '';
		if (line) return line.slice(0, 80);
	}
	return null;
}

function preambleTitle(segments: DocumentSegment[], start: number, end: number): string {
	for (let index = start; index < end; index++) {
		const segment = segments[index];
		if (!segment || isExcludedSegment(segment)) continue;
		if (segment.kind === 'heading' && segment.meta?.level === 1) {
			return headingText(segment);
		}
	}
	return firstParagraphTitle(segments.slice(start, end)) ?? 'Introduction';
}

export function buildSections(
	segments: DocumentSegment[],
	options?: ParseSegmentsOptions
): DocumentSection[] {
	const h2Indices: number[] = [];
	for (let index = 0; index < segments.length; index++) {
		const segment = segments[index];
		if (
			segment?.kind === 'heading' &&
			segment.meta?.level === 2
		) {
			h2Indices.push(index);
		}
	}

	const usedIds = new Set<string>();
	const sections: DocumentSection[] = [];

	if (h2Indices.length === 0) {
		const segmentStart = firstIncludedSegmentIndex(segments);
		const title =
			titleFromFileName(options?.fileName) ??
			firstParagraphTitle(segments) ??
			'Document';

		sections.push({
			id: '00-document',
			title,
			level: 0,
			order: 0,
			segmentStart,
			segmentEnd: segments.length
		});
		return sections;
	}

	const firstIncluded = firstIncludedSegmentIndex(segments);
	const firstH2 = h2Indices[0]!;

	if (firstIncluded < firstH2) {
		sections.push({
			id: '00-preamble',
			title: preambleTitle(segments, firstIncluded, firstH2),
			level: 0,
			order: sections.length,
			segmentStart: firstIncluded,
			segmentEnd: firstH2
		});
	}

	for (let h2Index = 0; h2Index < h2Indices.length; h2Index++) {
		const segmentStart = h2Indices[h2Index]!;
		const segmentEnd = h2Indices[h2Index + 1] ?? segments.length;
		const heading = segments[segmentStart]!;
		const title = headingText(heading);
		const order = sections.length;
		const slug = slugifyTitle(title);
		const id = uniqueSectionId(slug, order, usedIds);

		sections.push({
			id,
			title,
			level: 2,
			order,
			segmentStart,
			segmentEnd
		});
	}

	return sections;
}

export function parseNoteSegments(
	text: string,
	settings: Pick<SpeedReaderAiSettings, 'bookmarks'>,
	options?: Omit<ParseSegmentsOptions, 'bookmarkSectionHeading'>
): ParsedSegments {
	return parseSegments(text, {
		...options,
		bookmarkSectionHeading: settings.bookmarks.noteBookmarkSectionHeading
	});
}

export function parseSegments(
	text: string,
	options?: ParseSegmentsOptions
): ParsedSegments {
	const normalized = text.replace(/\r\n/g, '\n');
	const lineInfos = truncateBeforeBookmarkSection(
		splitLinesWithOffsets(normalized),
		options?.bookmarkSectionHeading
	);
	const segments: DocumentSegment[] = [];
	let index = 0;

	while (index < lineInfos.length) {
		const current = lineInfos[index];
		if (!current) break;

		const { line } = current;

		if (line.trim() === '') {
			index++;
			continue;
		}

		if (segments.length === 0 && FRONTMATTER_START.test(line)) {
			const parsed = parseFrontmatter(lineInfos, index);
			segments.push(parsed.segment);
			index = parsed.nextIndex;
			continue;
		}

		if (CODE_FENCE_RE.test(line)) {
			const parsed = parseCodeBlock(lineInfos, index);
			segments.push(parsed.segment);
			index = parsed.nextIndex;
			continue;
		}

		if (HR_RE.test(line.trim())) {
			segments.push(makeSegment('hr', lineInfos, index, index + 1));
			index++;
			continue;
		}

		const headingMatch = line.match(HEADING_RE);
		if (headingMatch) {
			segments.push(
				makeSegment('heading', lineInfos, index, index + 1, {
					level: headingMatch[1]?.length ?? 1
				})
			);
			index++;
			continue;
		}

		if (isTableStart(lineInfos, index)) {
			const parsed = parseTable(lineInfos, index);
			segments.push(parsed.segment);
			index = parsed.nextIndex;
			continue;
		}

		if (isCalloutLine(line)) {
			const parsed = parseCallout(lineInfos, index);
			segments.push(parsed.segment);
			index = parsed.nextIndex;
			continue;
		}

		if (isBlockquoteLine(line)) {
			const parsed = parseBlockquote(lineInfos, index);
			segments.push(parsed.segment);
			index = parsed.nextIndex;
			continue;
		}

		if (isUnorderedListLine(line) || isOrderedListLine(line)) {
			const parsed = parseList(lineInfos, index);
			segments.push(parsed.segment);
			index = parsed.nextIndex;
			continue;
		}

		if (STANDALONE_EMBED_RE.test(line)) {
			segments.push(makeSegment('embed', lineInfos, index, index + 1));
			index++;
			continue;
		}

		if (STANDALONE_IMAGE_RE.test(line)) {
			segments.push(makeSegment('image', lineInfos, index, index + 1));
			index++;
			continue;
		}

		const parsed = parseParagraph(lineInfos, index);
		segments.push(parsed.segment);
		index = parsed.nextIndex;
	}

	const sections = buildSections(segments, options);

	return {
		segments,
		sections,
		sourceLength: normalized.length
	};
}

export function getSectionAtSegmentIndex(
	sections: DocumentSection[],
	segmentIndex: number
): DocumentSection | null {
	if (segmentIndex < 0) return null;

	for (const section of sections) {
		if (
			segmentIndex >= section.segmentStart &&
			segmentIndex < section.segmentEnd
		) {
			return section;
		}
	}

	return null;
}

export function getSectionForEditorOffset(
	parsed: ParsedSegments,
	offset: number
): { sectionIndex: number; section: DocumentSection } | null {
	const segmentIndex = mapEditorOffsetToSegmentIndex(
		parsed.segments,
		offset
	);
	if (segmentIndex === -1) return null;

	const section = getSectionAtSegmentIndex(parsed.sections, segmentIndex);
	if (!section) return null;

	const sectionIndex = parsed.sections.indexOf(section);
	if (sectionIndex === -1) return null;

	return { sectionIndex, section };
}

export function findSegmentAtOffset(
	segments: DocumentSegment[],
	offset: number
): number {
	if (segments.length === 0) return -1;

	for (let index = 0; index < segments.length; index++) {
		const segment = segments[index];
		if (!segment) continue;
		if (offset >= segment.start && offset < segment.end) {
			return index;
		}
	}

	const last = segments[segments.length - 1];
	if (last && offset >= last.end) {
		return segments.length - 1;
	}

	return 0;
}

export function mapEditorOffsetToSegmentIndex(
	segments: DocumentSegment[],
	offset: number
): number {
	const index = findSegmentAtOffset(segments, offset);
	if (index === -1) return -1;

	const segment = segments[index];
	if (
		segment?.kind === 'frontmatter' &&
		segment.meta?.excluded === true
	) {
		return -1;
	}

	return index;
}
