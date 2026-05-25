import type { BookmarkEntry } from './parseBookmarkEntries';

export interface BookmarkBlockInput {
	timestamp: Date;
	sectionTitle?: string;
	passage: string;
	positionLine: string;
	uriLine?: string;
}

export interface BookmarkPassageInput {
	paragraphText: string;
	highlightedSentence: string;
}

function formatTimestamp(date: Date): string {
	return date.toISOString().replace('T', ' ').slice(0, 19);
}

function formatPositionForDisplay(positionLine: string): string {
	return positionLine.replace(/\s+word\s+/, ' · word ');
}

function formatPassageCallout(passage: string): string {
	const content = passage.trim() || '(no passage captured)';
	return ['> [!quote] Passage', ...content.split('\n').map((line) => `> ${line}`)].join('\n');
}

function formatResumeCallout(positionLine: string, uriLine?: string): string {
	const lines = ['> [!note] Resume', `> Position: ${formatPositionForDisplay(positionLine)}`];
	if (uriLine?.trim()) {
		lines.push(`> \`${uriLine.trim()}\``);
	}
	return lines.join('\n');
}

function wrapHighlightedSentence(sentence: string): string {
	return `==***${sentence}***==`;
}

/** Wrap the first exact match of highlightedSentence in Obsidian highlight + bold italic. */
export function formatPassageWithHighlight(input: BookmarkPassageInput): string {
	return formatPassageWithHighlights(input.paragraphText, [input.highlightedSentence]);
}

/** Wrap each sentence match in Obsidian highlight + bold italic. */
export function formatPassageWithHighlights(
	paragraphText: string,
	highlightedSentences: string[]
): string {
	const paragraph = paragraphText.trim();
	if (!paragraph) {
		const first = highlightedSentences.map((sentence) => sentence.trim()).find(Boolean);
		return first ? wrapHighlightedSentence(first) : '(no passage captured)';
	}

	const unique = [...new Set(highlightedSentences.map((sentence) => sentence.trim()).filter(Boolean))];
	if (unique.length === 0) {
		return paragraph;
	}

	const ordered = unique
		.map((sentence) => ({ sentence, index: paragraph.indexOf(sentence) }))
		.filter((entry) => entry.index >= 0)
		.sort((left, right) => right.index - left.index);

	let result = paragraph;
	for (const { sentence } of ordered) {
		const index = result.indexOf(sentence);
		if (index === -1) {
			continue;
		}
		result =
			result.slice(0, index) +
			wrapHighlightedSentence(sentence) +
			result.slice(index + sentence.length);
	}

	if (result === paragraph && unique.length === 1) {
		const sentence = unique[0]!;
		return `${paragraph} ${wrapHighlightedSentence(sentence)}`;
	}

	return result;
}

const HIGHLIGHTED_SENTENCE_RE = /==\*\*\*(.+?)\*\*\*==/g;

/** Remove one highlighted sentence wrapper from a bookmark passage. */
export function removeHighlightedSentenceFromPassage(passage: string, sentence: string): string {
	const target = sentence.trim();
	if (!target) {
		return passage;
	}

	const wrapped = wrapHighlightedSentence(target);
	if (passage.includes(wrapped)) {
		return passage.replace(wrapped, target);
	}

	return passage.replace(HIGHLIGHTED_SENTENCE_RE, (match, inner: string) => {
		const normalizedInner = inner.trim().replace(/\s+/g, ' ');
		const normalizedTarget = target.replace(/\s+/g, ' ');
		return normalizedInner === normalizedTarget ? inner.trim() : match;
	});
}

export function extractHighlightedSentences(passage: string): string[] {
	const results: string[] = [];
	const pattern = /==\*\*\*(.+?)\*\*\*==/g;
	let match = pattern.exec(passage);
	while (match) {
		const sentence = match[1]?.trim().replace(/\s+/g, ' ');
		if (sentence) {
			results.push(sentence);
		}
		match = pattern.exec(passage);
	}
	return results;
}

export function formatBookmarkBlock(input: BookmarkBlockInput): string {
	const headingSuffix = input.sectionTitle?.trim()
		? ` · ${input.sectionTitle.trim()}`
		: '';
	const lines = [
		`## ${formatTimestamp(input.timestamp)}${headingSuffix}`,
		'',
		formatPassageCallout(input.passage),
		'',
		formatResumeCallout(input.positionLine, input.uriLine)
	];
	return `${lines.join('\n')}\n`;
}

export function formatBookBookmarkUri(sourcePath: string, chapterId: string, wordIndex: number): string {
	const encoded = encodeURIComponent(sourcePath);
	return `speed-reader://book/${encoded}?chapter=${encodeURIComponent(chapterId)}&word=${wordIndex}`;
}

export function formatNoteBookmarkUri(sourcePath: string, sectionId: string, wordIndex: number): string {
	const encoded = encodeURIComponent(sourcePath);
	return `speed-reader://note/${encoded}?section=${encodeURIComponent(sectionId)}&word=${wordIndex}`;
}

export function serializeBookmarkEntry(entry: BookmarkEntry): string {
	const parsed = new Date(entry.timestamp.replace(' ', 'T'));
	return formatBookmarkBlock({
		timestamp: Number.isNaN(parsed.getTime()) ? new Date() : parsed,
		sectionTitle: entry.sectionTitle,
		passage: entry.passage,
		positionLine: entry.positionLine,
		uriLine: entry.resumeUri
	});
}
