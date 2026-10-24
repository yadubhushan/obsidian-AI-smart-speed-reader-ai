import { HeadingInfo, ParsedDocument, WordData } from '../types';

interface GraphemeSegment {
	index: number;
}

interface GraphemeSegmenterLike {
	segment(input: string): Iterable<GraphemeSegment>;
}

const graphemeSegmenter: GraphemeSegmenterLike | null = (() => {
	const intl = Intl as unknown as {
		Segmenter?: new (locale?: string, options?: { granularity: string }) => GraphemeSegmenterLike;
	};
	if (typeof intl.Segmenter !== 'function') return null;
	try {
		return new intl.Segmenter(undefined, { granularity: 'grapheme' });
	} catch {
		return null;
	}
})();

const COMBINING_MARK = /\p{M}/u;
// Virama / halant across the Indic blocks: it fuses the next consonant into the
// same cluster (क्ष).
const VIRAMA = /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D4D\u0DCA]/u;

/**
 * Code-unit offsets at which each grapheme cluster of `text` starts.
 * For pure ASCII this is simply [0, 1, 2, ...].
 */
export function graphemeStarts(text: string): number[] {
	const starts: number[] = [];
	if (text.length === 0) return starts;

	if (graphemeSegmenter) {
		for (const segment of graphemeSegmenter.segment(text)) {
			starts.push(segment.index);
		}
		return starts;
	}

	// Fallback: a base character absorbs the combining marks that follow it (and
	// the consonant after a virama), so a Devanagari matra or half-form is never
	// treated as a character of its own.
	let index = 0;
	let afterVirama = false;
	while (index < text.length) {
		const char = String.fromCodePoint(text.codePointAt(index)!);
		const isMark = COMBINING_MARK.test(char);
		if (starts.length > 0 && (isMark || afterVirama)) {
			afterVirama = VIRAMA.test(char);
			index += char.length;
			continue;
		}
		starts.push(index);
		afterVirama = VIRAMA.test(char);
		index += char.length;
	}
	return starts;
}

/** Start offset of the grapheme cluster containing `index`. */
function clusterStartAt(starts: number[], index: number): number {
	let result = starts[0] ?? 0;
	for (const start of starts) {
		if (start > index) break;
		result = start;
	}
	return result;
}

export function calculateORP(word: string): number {
	const starts = graphemeStarts(word);
	const len = starts.length;
	if (len <= 1) return 0;
	if (len <= 5) return starts[1]!;
	if (len <= 9) return starts[2]!;
	return starts[3]!;
}

export function resolveDisplayOrpIndex(text: string, preferredIndex?: number): number {
	if (text.length === 0) {
		return 0;
	}
	const starts = graphemeStarts(text);
	const requested = preferredIndex ?? calculateORP(text);
	// Never split a grapheme cluster: snap onto the cluster that contains the
	// requested offset, otherwise a Devanagari matra renders on its own as a
	// dotted circle (थी -> थ + ◌ी).
	const index = clusterStartAt(starts, Math.max(0, Math.min(requested, text.length - 1)));
	const position = starts.indexOf(index);

	if (text[index] && !/\s/.test(text[index])) {
		return index;
	}
	for (let i = position + 1; i < starts.length; i++) {
		if (!/\s/.test(text[starts[i]!]!)) {
			return starts[i]!;
		}
	}
	for (let i = position - 1; i >= 0; i--) {
		if (!/\s/.test(text[starts[i]!]!)) {
			return starts[i]!;
		}
	}
	return starts[0] ?? 0;
}

export function splitWordForOrpDisplay(
	text: string,
	preferredOrpIndex?: number
): { before: string; orp: string; after: string } {
	if (text.length === 0) {
		return { before: '', orp: '', after: '' };
	}

	const starts = graphemeStarts(text);
	const orpIndex = resolveDisplayOrpIndex(text, preferredOrpIndex);
	const position = starts.indexOf(orpIndex);
	const orpEnd = position >= 0 && position + 1 < starts.length ? starts[position + 1]! : text.length;

	let before = text.slice(0, orpIndex);
	let orp = text.slice(orpIndex, orpEnd);
	let after = text.slice(orpEnd);

	// Keep inter-word spaces attached to the ORP span so they are not collapsed
	// when `after` would otherwise start with whitespace in inline-flex layout.
	const leadingSpaces = after.match(/^[ \t]+/);
	if (leadingSpaces) {
		orp += leadingSpaces[0];
		after = after.slice(leadingSpaces[0].length);
	}

	return { before, orp, after };
}

function stripTrailingPunctuation(word: string): { clean: string; punctuation: string } {
	// \u0964/\u0965 are the Devanagari danda and double danda (Hindi sentence ends).
	const match = word.match(/^(.+?)([.,!?;:)}\]"'\u0964\u0965]+)$/u);
	if (match && match[1] && match[2]) {
		return { clean: match[1], punctuation: match[2] };
	}
	return { clean: word, punctuation: '' };
}

function stripMarkdown(text: string): string {
	let result = text;

	result = result.replace(/^---[\s\S]*?---\n?/gm, '');

	result = result.replace(/^```[\s\S]*?^```/gm, '');
	result = result.replace(/```[\s\S]*?```/g, '');

	result = result.replace(/`([^`]+)`/g, '$1');

	result = result.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

	result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

	result = result.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match: string, target: string, display: string) => {
		return display ?? target;
	});

	result = result.replace(/^(#{1,6})\s+/gm, '');

	result = result.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
	result = result.replace(/___([^_\n]+)___/g, '$1');
	result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
	result = result.replace(/(?<!\w)__([^_\n]+)__(?!\w)/g, '$1');
	result = result.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '$1');
	result = result.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');

	result = result.replace(/~~([^~]+)~~/g, '$1');
	result = result.replace(/==([^=]+)==/g, '$1');
	result = result.replace(/%%([^%]+)%%/g, '');

	result = result.replace(/^[-*+]\s+/gm, ' ');
	result = result.replace(/^\d+\.\s+/gm, ' ');
	result = result.replace(/^>\s+/gm, '');

	result = result.replace(/^---+\s*$/gm, '');
	result = result.replace(/^-{3,}\s*$/gm, '');

	result = result.replace(/<br\s*\/?>/gi, ' ');
	result = result.replace(/<[^>]+>/g, '');

	return result;
}

export function splitGluedWordToken(raw: string): string[] {
	const result: string[] = [];
	let remaining = stripTerminalFootnoteMarker(raw);
	const gluedBoundary =
		/^(.+?[.!?])(['"\u2019\u201d\u201c]*(?:['\u2018"]?[A-Z]|['\u2018"\u201c']).*)$/;

	while (remaining.length > 0) {
		const match = remaining.match(gluedBoundary);
		if (!match?.[1] || !match[2]) {
			result.push(remaining);
			break;
		}
		result.push(match[1]);
		remaining = match[2];
	}

	return result.filter((part) => part.length > 0);
}

function stripTerminalFootnoteMarker(raw: string): string {
	const match = raw.match(/^([A-Za-z][A-Za-z'\u2019-]*[.!?](?:["'\u2019\u201d)\]]?)?)(\d{1,3})$/);
	if (!match?.[1]) {
		return raw;
	}
	return match[1];
}

function tokenize(text: string): { raw: string; start: number }[] {
	const tokens: { raw: string; start: number }[] = [];
	const pattern = /\S+/g;
	let match = pattern.exec(text);

	while (match !== null) {
		const rawToken = match[0];
		const tokenStart = match.index;
		let offset = 0;

		for (const part of splitGluedWordToken(rawToken)) {
			tokens.push({ raw: part, start: tokenStart + offset });
			offset += part.length;
		}

		match = pattern.exec(text);
	}

	return tokens;
}

export function stripLeadingPunctuation(word: string): { clean: string; leading: string } {
	const match = word.match(/^([([{'"(]+)(.+)$/);
	if (match && match[1] && match[2]) {
		return { clean: match[2], leading: match[1] };
	}
	return { clean: word, leading: '' };
}

function parseWords(strippedText: string): WordData[] {
	const words: WordData[] = [];
	const tokens = tokenize(strippedText);

	for (const token of tokens) {
		const { raw, start } = token;
		let displayWord = raw;
		let punctuation = '';

		if (raw.startsWith('(') && raw.endsWith(')') && raw.length > 2) {
			displayWord = raw.slice(1, -1);
			const inner = stripTrailingPunctuation(displayWord);
			displayWord = inner.clean.length > 0 ? inner.clean : displayWord;
			punctuation = inner.punctuation;
		} else {
			const leadingStripped = stripLeadingPunctuation(raw);
			const trailingStripped = stripTrailingPunctuation(leadingStripped.clean);
			displayWord = trailingStripped.clean.length > 0 ? trailingStripped.clean : leadingStripped.clean;
			punctuation = trailingStripped.punctuation;
		}

		words.push({
			raw,
			word: displayWord,
			punctuation,
			orpIndex: calculateORP(displayWord),
			start,
			end: start + raw.length
		});
	}

	return words;
}

function findWordIndexAtOffset(words: WordData[], offset: number): number {
	if (words.length === 0) return 0;
	const firstWord = words[0];
	if (!firstWord) return 0;
	if (offset <= firstWord.start) return 0;

	let left = 0;
	let right = words.length - 1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const word = words[mid];
		if (!word) {
			break;
		}

		if (offset < word.start) {
			right = mid - 1;
		} else if (offset > word.end) {
			left = mid + 1;
		} else {
			return mid;
		}
	}

	if (left >= words.length) {
		return words.length - 1;
	}

	return left;
}

function extractHeadings(text: string, words: WordData[]): HeadingInfo[] {
	const headings: HeadingInfo[] = [];
	const lines = text.split(/\r?\n/);
	let offset = 0;

	for (const line of lines) {
		const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
		if (match && match[1] && match[2]) {
			const level = match[1].length;
			const title = match[2].trim();
			if (title.length > 0) {
				const wordIndex = findWordIndexAtOffset(words, offset);
				headings.push({ level, text: title, wordIndex });
			}
		}

		offset += line.length + 1;
	}

	return headings;
}

export function parseDocument(text: string, startOffset = 0): ParsedDocument {
	const strippedText = stripMarkdown(text);
	const words = parseWords(strippedText);
	const headings = extractHeadings(text, words);
	const boundedStartOffset = Math.max(0, startOffset);
	const startWordIndex = findWordIndexAtOffset(words, boundedStartOffset);

	return {
		words,
		headings,
		startWordIndex
	};
}

export { stripMarkdown };
