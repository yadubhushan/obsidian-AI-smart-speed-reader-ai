import { describe, expect, it } from 'vitest';
import { buildSentenceUnits } from '../src/engine/lineRepeatPlayback';
import type { NavWord } from '../src/engine/readingNavigation';
import {
	buildBookmarkContextLinesFromData,
	groupSelectionsByParagraph,
	lineMatchesBookmarkEntry,
	matchBookmarkedLineIndices,
	removeLineFromBookmarkEntry
} from '../src/bookmarks/bookmarkContextLines';
import {
	formatPassageWithHighlights,
	removeHighlightedSentenceFromPassage
} from '../src/bookmarks/bookmarkBlock';

function nav(words: string[], paragraphStarts: number[] = [0]): NavWord[] {
	const startSet = new Set(paragraphStarts);
	return words.map((display, wordIndex) => ({
		wordIndex,
		seekIndex: wordIndex,
		display,
		isSentenceEnd: /[.!?]$/.test(display),
		isParagraphStart: startSet.has(wordIndex)
	}));
}

describe('bookmarkContextLines', () => {
	it('builds sentence cards with paragraph indices', () => {
		const navWords = nav(['First.', 'Second.', 'Third.', 'Fourth.'], [0, 2]);
		const sentenceUnits = buildSentenceUnits(navWords);
		const snapshot = buildBookmarkContextLinesFromData(navWords, sentenceUnits, 1);

		expect(snapshot.lines).toHaveLength(4);
		expect(snapshot.lines[0]).toMatchObject({
			lineIndex: 0,
			text: 'First.',
			paragraphIndex: 0,
			startSeekIndex: 0
		});
		expect(snapshot.lines[2]).toMatchObject({
			lineIndex: 2,
			text: 'Third.',
			paragraphIndex: 1
		});
		expect(snapshot.currentLineIndex).toBe(1);
	});

	it('groups selections by paragraph', () => {
		const lines = [
			{ lineIndex: 0, text: 'A.', paragraphIndex: 0, startSeekIndex: 0, startWordIdx: 0 },
			{ lineIndex: 1, text: 'B.', paragraphIndex: 0, startSeekIndex: 1, startWordIdx: 1 },
			{ lineIndex: 2, text: 'C.', paragraphIndex: 1, startSeekIndex: 2, startWordIdx: 2 },
			{ lineIndex: 3, text: 'D.', paragraphIndex: 1, startSeekIndex: 3, startWordIdx: 3 }
		];

		const groups = groupSelectionsByParagraph(lines, [0, 1, 3]);
		expect(groups.size).toBe(2);
		expect(groups.get(0)?.map((line) => line.lineIndex)).toEqual([0, 1]);
		expect(groups.get(1)?.map((line) => line.lineIndex)).toEqual([3]);
	});

	it('matches bookmarked lines by resume URI word index', () => {
		const lines = [
			{ lineIndex: 0, text: 'Alpha.', paragraphIndex: 0, startSeekIndex: 0, startWordIdx: 0 },
			{ lineIndex: 1, text: 'Beta.', paragraphIndex: 0, startSeekIndex: 1, startWordIdx: 1 }
		];
		const entries = [
			{
				timestamp: '2026-01-01 12:00:00',
				passage: '==***Beta.***==',
				lineCards: [{ text: 'Beta.' }],
				positionLine: 'section section-01 · word 1',
				resumeUri: 'speed-reader://note/notes/book.md?section=section-01&word=1'
			}
		];

		const matched = matchBookmarkedLineIndices(entries, lines, 'note');
		expect([...matched]).toEqual([1]);
	});

	it('matches bookmarked lines by highlighted passage text', () => {
		const lines = [
			{ lineIndex: 0, text: 'First sentence.', paragraphIndex: 0, startSeekIndex: 0, startWordIdx: 0 },
			{ lineIndex: 1, text: 'Second sentence.', paragraphIndex: 0, startSeekIndex: 4, startWordIdx: 4 }
		];
		const entries = [
			{
				timestamp: '2026-01-01 12:00:00',
				passage: '==***Second sentence.***==',
				lineCards: [],
				positionLine: 'section section-01 · word 99'
			}
		];

		const matched = matchBookmarkedLineIndices(entries, lines, 'note');
		expect([...matched]).toEqual([1]);
	});

	it('does not false-positive partial text matches', () => {
		const lines = [
			{ lineIndex: 0, text: 'Room.', paragraphIndex: 0, startSeekIndex: 0, startWordIdx: 0 },
			{ lineIndex: 1, text: 'A large room.', paragraphIndex: 0, startSeekIndex: 1, startWordIdx: 1 }
		];
		const entries = [
			{
				timestamp: '2026-01-01 12:00:00',
				passage: '==***Room.***==',
				lineCards: [{ text: 'Room.' }],
				positionLine: 'section section-01 · word 0'
			}
		];

		const matched = matchBookmarkedLineIndices(entries, lines, 'note');
		expect([...matched]).toEqual([0]);
	});

	it('lineMatchesBookmarkEntry matches by anchor and text', () => {
		const line = {
			lineIndex: 1,
			text: 'Beta.',
			paragraphIndex: 0,
			startSeekIndex: 1,
			startWordIdx: 1
		};
		const entry = {
			timestamp: '2026-01-01 12:00:00',
			passage: '==***Beta.***==',
			lineCards: [{ text: 'Beta.' }],
			positionLine: 'section section-01 · word 1',
			resumeUri: 'speed-reader://note/notes/book.md?section=section-01&word=1'
		};
		expect(lineMatchesBookmarkEntry(line, entry, 'note')).toBe(true);
		expect(
			lineMatchesBookmarkEntry(
				{ ...line, lineIndex: 0, text: 'Alpha.', startSeekIndex: 0, startWordIdx: 0 },
				entry,
				'note'
			)
		).toBe(false);
	});

	it('removeLineFromBookmarkEntry removes one highlight from a multi-line bookmark', () => {
		const passage = formatPassageWithHighlights('Alpha. Beta. Gamma.', ['Alpha.', 'Gamma.']);
		const entry = {
			timestamp: '2026-01-01 12:00:00',
			passage,
			lineCards: [{ text: passage }],
			positionLine: 'section section-01 · word 0'
		};
		const line = {
			lineIndex: 0,
			text: 'Alpha.',
			paragraphIndex: 0,
			startSeekIndex: 0,
			startWordIdx: 0
		};

		const updated = removeLineFromBookmarkEntry(entry, line, 'note');
		expect(updated).not.toBeNull();
		expect(updated!.passage).toBe('Alpha. Beta. ==***Gamma.***==');
		expect(lineMatchesBookmarkEntry(line, updated!, 'note')).toBe(false);
		expect(lineMatchesBookmarkEntry(
			{ ...line, lineIndex: 2, text: 'Gamma.', startSeekIndex: 2, startWordIdx: 2 },
			updated!,
			'note'
		)).toBe(true);
	});

	it('removeLineFromBookmarkEntry deletes entry when removing the last highlight', () => {
		const entry = {
			timestamp: '2026-01-01 12:00:00',
			passage: '==***Only line.***==',
			lineCards: [{ text: '==***Only line.***==' }],
			positionLine: 'section section-01 · word 0'
		};
		const line = {
			lineIndex: 0,
			text: 'Only line.',
			paragraphIndex: 0,
			startSeekIndex: 0,
			startWordIdx: 0
		};
		expect(removeLineFromBookmarkEntry(entry, line, 'note')).toBeNull();
	});
});

describe('formatPassageWithHighlights', () => {
	it('highlights multiple sentences in one paragraph', () => {
		const passage = formatPassageWithHighlights(
			'The room was bright. The wheels were turning. A large room.',
			['The room was bright.', 'A large room.']
		);
		expect(passage).toContain('==***The room was bright.***==');
		expect(passage).toContain('==***A large room.***==');
		expect(passage).toContain('The wheels were turning.');
	});

	it('highlights non-contiguous sentences in one paragraph', () => {
		const passage = formatPassageWithHighlights('Alpha. Beta. Gamma.', ['Alpha.', 'Gamma.']);
		expect(passage).toBe('==***Alpha.***== Beta. ==***Gamma.***==');
	});

	it('removeHighlightedSentenceFromPassage unwraps one sentence', () => {
		const passage = formatPassageWithHighlights('Alpha. Beta. Gamma.', ['Alpha.', 'Gamma.']);
		expect(removeHighlightedSentenceFromPassage(passage, 'Gamma.')).toBe(
			'==***Alpha.***== Beta. Gamma.'
		);
	});
});
