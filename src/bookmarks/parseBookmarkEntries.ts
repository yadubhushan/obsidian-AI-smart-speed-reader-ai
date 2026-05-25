export interface BookmarkLineCard {
	text: string;
}

export interface BookmarkEntry {
	timestamp: string;
	sectionTitle?: string;
	passage: string;
	lineCards: BookmarkLineCard[];
	positionLine: string;
	resumeUri?: string;
}

const ENTRY_HEADING_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\s*[·—]\s*(.+))?$/;
const QUOTE_CALLOUT_RE = /^>\s*\[!quote\]\s*Passage\s*$/i;
const NOTE_CALLOUT_RE = /^>\s*\[!note\]\s*Resume\s*$/i;
const BLOCKQUOTE_LINE_RE = /^>\s?(.*)$/;
const POSITION_LINE_RE = /^Position:\s*(.+)$/i;
const RESUME_URI_RE = /^`?(speed-reader:\/\/[^`\s]+)`?$/;

function stripBlockquotePrefix(line: string): string {
	const match = line.match(BLOCKQUOTE_LINE_RE);
	return match ? (match[1] ?? '') : line;
}

function splitPassageIntoLineCards(passage: string): BookmarkLineCard[] {
	const trimmed = passage.trim();
	if (!trimmed) {
		return [];
	}
	return trimmed.split('\n').map((line) => ({ text: line }));
}

function parseHeadingLine(line: string): Pick<BookmarkEntry, 'timestamp' | 'sectionTitle'> | null {
	const match = line.trim().match(ENTRY_HEADING_RE);
	if (!match) {
		return null;
	}
	const sectionTitle = match[2]?.trim();
	return {
		timestamp: match[1] ?? '',
		sectionTitle: sectionTitle || undefined
	};
}

function collectCalloutBody(lines: string[], startIndex: number): { body: string[]; nextIndex: number } {
	const body: string[] = [];
	let index = startIndex;
	while (index < lines.length) {
		const line = lines[index] ?? '';
		if (line.trim() === '') {
			break;
		}
		if (/^>\s*\[!/.test(line) && index > startIndex) {
			break;
		}
		if (!line.startsWith('>')) {
			break;
		}
		body.push(stripBlockquotePrefix(line));
		index += 1;
	}
	return { body, nextIndex: index };
}

function parsePassageFromBody(lines: string[]): { passage: string; nextIndex: number } {
	let index = 0;
	while (index < lines.length && lines[index]?.trim() === '') {
		index += 1;
	}

	if (index >= lines.length) {
		return { passage: '', nextIndex: index };
	}

	if (QUOTE_CALLOUT_RE.test(lines[index] ?? '')) {
		const { body, nextIndex } = collectCalloutBody(lines, index + 1);
		return { passage: body.join('\n'), nextIndex };
	}

	const blockquoteLines: string[] = [];
	while (index < lines.length) {
		const line = lines[index] ?? '';
		if (line.trim() === '') {
			break;
		}
		if (POSITION_LINE_RE.test(line.trim())) {
			break;
		}
		if (RESUME_URI_RE.test(line.trim())) {
			break;
		}
		if (NOTE_CALLOUT_RE.test(line)) {
			break;
		}
		const match = line.match(BLOCKQUOTE_LINE_RE);
		if (!match) {
			break;
		}
		if (/^>\s*\[!/.test(line)) {
			break;
		}
		blockquoteLines.push(match[1] ?? '');
		index += 1;
	}
	return { passage: blockquoteLines.join('\n'), nextIndex: index };
}

function parseResumeFromBody(lines: string[], startIndex: number): {
	positionLine: string;
	resumeUri?: string;
} {
	let index = startIndex;
	while (index < lines.length && lines[index]?.trim() === '') {
		index += 1;
	}

	if (index < lines.length && NOTE_CALLOUT_RE.test(lines[index] ?? '')) {
		const { body, nextIndex } = collectCalloutBody(lines, index + 1);
		index = nextIndex;
		return extractPositionAndUri(body);
	}

	const tail = lines.slice(index);
	return extractPositionAndUri(tail);
}

function extractPositionAndUri(lines: string[]): {
	positionLine: string;
	resumeUri?: string;
} {
	let positionLine = '';
	let resumeUri: string | undefined;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) {
			continue;
		}

		const positionMatch = line.match(POSITION_LINE_RE);
		if (positionMatch) {
			positionLine = (positionMatch[1] ?? '').trim();
			continue;
		}

		const uriMatch = line.match(RESUME_URI_RE);
		if (uriMatch) {
			resumeUri = uriMatch[1];
		}
	}

	return { positionLine, resumeUri };
}

function parseBookmarkEntryBody(body: string): Omit<BookmarkEntry, 'timestamp' | 'sectionTitle'> {
	const lines = body.replace(/\r\n/g, '\n').split('\n');
	const { passage, nextIndex } = parsePassageFromBody(lines);
	const { positionLine, resumeUri } = parseResumeFromBody(lines, nextIndex);

	return {
		passage,
		lineCards: splitPassageIntoLineCards(passage),
		positionLine,
		resumeUri
	};
}

/** Parse bookmark entries from markdown (note bookmark sections or book bookmark files). */
export function parseBookmarkEntries(markdown: string): BookmarkEntry[] {
	const normalized = markdown.replace(/\r\n/g, '\n');
	const entries: BookmarkEntry[] = [];
	const chunks = normalized.split(/^## /m);

	for (let chunkIndex = 1; chunkIndex < chunks.length; chunkIndex += 1) {
		const chunk = chunks[chunkIndex] ?? '';
		const newlineIndex = chunk.indexOf('\n');
		const headingLine = newlineIndex >= 0 ? chunk.slice(0, newlineIndex) : chunk;
		const body = newlineIndex >= 0 ? chunk.slice(newlineIndex + 1) : '';

		const heading = parseHeadingLine(headingLine);
		if (!heading) {
			continue;
		}

		const parsed = parseBookmarkEntryBody(body);
		entries.push({
			...heading,
			...parsed
		});
	}

	return entries;
}

/** Parse bookmark entries from a note's bookmark section (content after the H1 heading). */
export function parseNoteBookmarkSection(markdown: string, heading: string): BookmarkEntry[] {
	const normalized = markdown.replace(/\r\n/g, '\n');
	const escapedHeading = heading.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const h1Pattern = new RegExp(`^#\\s+${escapedHeading}\\s*$`, 'im');
	const match = h1Pattern.exec(normalized);
	if (!match) {
		return [];
	}

	const start = match.index + match[0].length;
	const rest = normalized.slice(start);
	const nextH1 = rest.search(/^#\s+/m);
	const section = nextH1 >= 0 ? rest.slice(0, nextH1) : rest;
	return parseBookmarkEntries(section);
}
