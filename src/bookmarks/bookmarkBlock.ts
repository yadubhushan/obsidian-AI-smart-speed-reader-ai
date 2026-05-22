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

function escapeBlockquote(text: string): string {
	return text
		.split('\n')
		.map((line) => `> ${line}`)
		.join('\n');
}

function wrapHighlightedSentence(sentence: string): string {
	return `==***${sentence}***==`;
}

/** Wrap the first exact match of highlightedSentence in Obsidian highlight + bold italic. */
export function formatPassageWithHighlight(input: BookmarkPassageInput): string {
	const paragraph = input.paragraphText.trim();
	const sentence = input.highlightedSentence.trim();

	if (!sentence) {
		return paragraph || '(no passage captured)';
	}

	if (!paragraph) {
		return wrapHighlightedSentence(sentence);
	}

	const index = paragraph.indexOf(sentence);
	if (index === -1) {
		return `${paragraph} ${wrapHighlightedSentence(sentence)}`;
	}

	return (
		paragraph.slice(0, index) +
		wrapHighlightedSentence(sentence) +
		paragraph.slice(index + sentence.length)
	);
}

export function formatBookmarkBlock(input: BookmarkBlockInput): string {
	const headingSuffix = input.sectionTitle?.trim()
		? ` — ${input.sectionTitle.trim()}`
		: '';
	const lines = [
		`## ${formatTimestamp(input.timestamp)}${headingSuffix}`,
		'',
		escapeBlockquote(input.passage.trim() || '(no passage captured)'),
		'',
		`Position: ${input.positionLine}`
	];
	if (input.uriLine?.trim()) {
		// Inline code keeps the URI inert: no autolink, no third-party "define selection" on the URL.
		lines.push('', `\`${input.uriLine.trim()}\``);
	}
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
