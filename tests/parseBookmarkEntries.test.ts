import { describe, expect, it } from 'vitest';
import {
	formatBookBookmarkUri,
	formatBookmarkBlock,
	formatPassageWithHighlight
} from '../src/bookmarks/bookmarkBlock';
import {
	parseBookmarkEntries,
	parseNoteBookmarkSection
} from '../src/bookmarks/parseBookmarkEntries';

const OLD_BOOKMARK = `## 2026-05-21 14:32:00 — Chapter 2

> The room was bright. ==***The wheels were turning.***== A large room.

Position: chapter ch-02 word 1842

\`speed-reader://book/library%2Fbook.epub?chapter=ch-02&word=1842\``;

const NEW_BOOKMARK = `## 2026-05-21 14:32:00 · Chapter 2

> [!quote] Passage
> The room was very bright. ==***The wheels were turning loudly.***== A large bare room.

> [!note] Resume
> Position: chapter ch-02 · word 1842
> \`speed-reader://book/library%2Fbook.epub?chapter=ch-02&word=1842\``;

describe('parseBookmarkEntries', () => {
	it('parses old-format bookmark entries', () => {
		const entries = parseBookmarkEntries(OLD_BOOKMARK);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			timestamp: '2026-05-21 14:32:00',
			sectionTitle: 'Chapter 2',
			passage: 'The room was bright. ==***The wheels were turning.***== A large room.',
			positionLine: 'chapter ch-02 word 1842',
			resumeUri: 'speed-reader://book/library%2Fbook.epub?chapter=ch-02&word=1842'
		});
	});

	it('parses new-format bookmark entries with callouts', () => {
		const entries = parseBookmarkEntries(NEW_BOOKMARK);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			timestamp: '2026-05-21 14:32:00',
			sectionTitle: 'Chapter 2',
			passage:
				'The room was very bright. ==***The wheels were turning loudly.***== A large bare room.',
			positionLine: 'chapter ch-02 · word 1842',
			resumeUri: 'speed-reader://book/library%2Fbook.epub?chapter=ch-02&word=1842'
		});
	});

	it('splits passage into line cards preserving highlight markup', () => {
		const multiLine = `## 2026-05-21 12:00:00

> [!quote] Passage
> Line one. ==***highlight***== here.
> Line two plain.

> [!note] Resume
> Position: section s · word 0`;

		const entries = parseBookmarkEntries(multiLine);
		expect(entries[0]?.lineCards).toEqual([
			{ text: 'Line one. ==***highlight***== here.' },
			{ text: 'Line two plain.' }
		]);
	});

	it('parses old-format multi-line blockquotes into line cards', () => {
		const multiLine = `## 2026-05-21 12:00:00

> Line one. ==***highlight***== here.
> Line two plain.

Position: section s word 0`;

		const entries = parseBookmarkEntries(multiLine);
		expect(entries[0]?.lineCards).toEqual([
			{ text: 'Line one. ==***highlight***== here.' },
			{ text: 'Line two plain.' }
		]);
	});

	it('parses multiple entries from a book bookmark file', () => {
		const file = `${OLD_BOOKMARK}\n\n${NEW_BOOKMARK}`;
		const entries = parseBookmarkEntries(file);
		expect(entries).toHaveLength(2);
		expect(entries[0]?.sectionTitle).toBe('Chapter 2');
		expect(entries[1]?.passage).toContain('==***The wheels were turning loudly.***==');
	});

	it('round-trips new format through formatBookmarkBlock and parser', () => {
		const uri = formatBookBookmarkUri('library/book.epub', 'ch-02', 1842);
		const passage = formatPassageWithHighlight({
			paragraphText: 'The room was very bright. The wheels were turning loudly. A large bare room.',
			highlightedSentence: 'The wheels were turning loudly.'
		});
		const block = formatBookmarkBlock({
			timestamp: new Date('2026-05-21T14:32:00Z'),
			sectionTitle: 'Chapter 2',
			passage,
			positionLine: 'chapter ch-02 word 1842',
			uriLine: uri
		});

		const entries = parseBookmarkEntries(block);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			timestamp: '2026-05-21 14:32:00',
			sectionTitle: 'Chapter 2',
			positionLine: 'chapter ch-02 · word 1842',
			resumeUri: uri
		});
		expect(entries[0]?.passage).toContain('==***The wheels were turning loudly.***==');
	});
});

describe('parseNoteBookmarkSection', () => {
	it('extracts entries from a note bookmark section', () => {
		const note = `# Speed Reader Bookmarks

${NEW_BOOKMARK}

## Other section

Unrelated content.`;

		const entries = parseNoteBookmarkSection(note, 'Speed Reader Bookmarks');
		expect(entries).toHaveLength(1);
		expect(entries[0]?.sectionTitle).toBe('Chapter 2');
	});

	it('returns empty array when bookmark section heading is missing', () => {
		expect(parseNoteBookmarkSection('# Other\n\nNo bookmarks.', 'Speed Reader Bookmarks')).toEqual(
			[]
		);
	});
});
