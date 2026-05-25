import type { RSVPEngine } from '../engine/rsvpEngine';
import type { SentenceUnit } from '../engine/lineRepeatPlayback';
import { findSentenceUnitForSeekIndex } from '../engine/lineRepeatPlayback';
import type { NavWord } from '../engine/readingNavigation';
import { buildParagraphUnits } from '../engine/paragraphUnits';
import type { BookmarkEntry } from './parseBookmarkEntries';
import { extractHighlightedSentences, removeHighlightedSentenceFromPassage } from './bookmarkBlock';

export interface BookmarkContextLine {
	lineIndex: number;
	text: string;
	paragraphIndex: number;
	startSeekIndex: number;
	startWordIdx: number;
}

export interface BookmarkContextSnapshot {
	lines: BookmarkContextLine[];
	currentLineIndex: number;
}

function paragraphIndexForWordIdx(
	paragraphUnits: Array<{ startWordIdx: number; endWordIdx: number }>,
	wordIdx: number
): number {
	for (let i = 0; i < paragraphUnits.length; i++) {
		const unit = paragraphUnits[i]!;
		if (wordIdx >= unit.startWordIdx && wordIdx <= unit.endWordIdx) {
			return i;
		}
	}
	return 0;
}

export function buildBookmarkContextLinesFromData(
	navWords: NavWord[],
	sentenceUnits: SentenceUnit[],
	currentSeekIndex: number
): BookmarkContextSnapshot {
	if (sentenceUnits.length === 0) {
		return { lines: [], currentLineIndex: 0 };
	}

	const paragraphUnits = buildParagraphUnits(navWords, sentenceUnits);
	const lines: BookmarkContextLine[] = sentenceUnits.map((unit, lineIndex) => ({
		lineIndex,
		text: navWords
			.slice(unit.startWordIdx, unit.endWordIdx + 1)
			.map((word) => word.display)
			.join(' ')
			.trim(),
		paragraphIndex: paragraphIndexForWordIdx(paragraphUnits, unit.startWordIdx),
		startSeekIndex: unit.startSeekIndex,
		startWordIdx: unit.startWordIdx
	}));

	return {
		lines,
		currentLineIndex: findSentenceUnitForSeekIndex(sentenceUnits, currentSeekIndex)
	};
}

export function buildBookmarkContextLines(engine: RSVPEngine): BookmarkContextSnapshot {
	return engine.getBookmarkContextSnapshot();
}

export function groupSelectionsByParagraph(
	lines: BookmarkContextLine[],
	selectedLineIndices: number[]
): Map<number, BookmarkContextLine[]> {
	const selected = new Set(selectedLineIndices);
	const groups = new Map<number, BookmarkContextLine[]>();

	for (const line of lines) {
		if (!selected.has(line.lineIndex)) {
			continue;
		}
		const group = groups.get(line.paragraphIndex) ?? [];
		group.push(line);
		groups.set(line.paragraphIndex, group);
	}

	for (const [paragraphIndex, group] of groups) {
		groups.set(
			paragraphIndex,
			group.sort((left, right) => left.lineIndex - right.lineIndex)
		);
	}

	return groups;
}

function normalizeLineText(text: string): string {
	return text.trim().replace(/\s+/g, ' ');
}

/** Whether a saved bookmark entry corresponds to an explore line. */
export function lineMatchesBookmarkEntry(
	line: BookmarkContextLine,
	entry: BookmarkEntry,
	_kind: 'book' | 'note'
): boolean {
	const normalized = normalizeLineText(line.text);
	return extractHighlightedSentences(entry.passage)
		.map(normalizeLineText)
		.some((sentence) => sentence === normalized);
}

/**
 * Remove one explore line from a saved bookmark entry.
 * Returns null when the entry should be deleted entirely.
 */
export function removeLineFromBookmarkEntry(
	entry: BookmarkEntry,
	line: BookmarkContextLine,
	kind: 'book' | 'note'
): BookmarkEntry | null {
	if (!lineMatchesBookmarkEntry(line, entry, kind)) {
		return entry;
	}

	const normalized = normalizeLineText(line.text);
	const highlighted = extractHighlightedSentences(entry.passage).map(normalizeLineText);
	const matchesHighlightedText = highlighted.some((sentence) => sentence === normalized);

	if (!matchesHighlightedText) {
		return highlighted.length <= 1 ? null : entry;
	}

	const nextPassage = removeHighlightedSentenceFromPassage(entry.passage, normalized);
	if (extractHighlightedSentences(nextPassage).length === 0) {
		return null;
	}

	return {
		...entry,
		passage: nextPassage,
		lineCards: nextPassage
			.trim()
			.split('\n')
			.map((text) => ({ text }))
	};
}

/** Map saved bookmark entries to explore-line indices for badge display. */
export function matchBookmarkedLineIndices(
	entries: BookmarkEntry[],
	lines: BookmarkContextLine[],
	kind: 'book' | 'note'
): Set<number> {
	const matched = new Set<number>();

	for (const entry of entries) {
		for (const line of lines) {
			if (lineMatchesBookmarkEntry(line, entry, kind)) {
				matched.add(line.lineIndex);
			}
		}
	}

	return matched;
}
