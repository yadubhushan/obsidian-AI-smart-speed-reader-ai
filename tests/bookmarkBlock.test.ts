import { describe, expect, it } from 'vitest';
import {
	formatBookBookmarkUri,
	formatBookmarkBlock,
	formatNoteBookmarkUri,
	formatPassageWithHighlight
} from '../src/bookmarks/bookmarkBlock';

describe('bookmarkBlock', () => {
	it('uses callout layout with middle-dot separators', () => {
		const uri = formatBookBookmarkUri('library/book.epub', 'ch-1', 42);
		const block = formatBookmarkBlock({
			timestamp: new Date('2026-05-21T12:00:00Z'),
			sectionTitle: 'Chapter 2',
			passage: 'Sample passage.',
			positionLine: 'chapter ch-1 word 42',
			uriLine: uri
		});

		expect(block).toContain('## 2026-05-21 12:00:00 · Chapter 2');
		expect(block).toContain('> [!quote] Passage');
		expect(block).toContain('> Sample passage.');
		expect(block).toContain('> [!note] Resume');
		expect(block).toContain('> Position: chapter ch-1 · word 42');
		expect(block).toContain(`> \`${uri}\``);
		expect(block).not.toContain(' — ');
	});

	it('wraps resume URI in inline code inside the resume callout', () => {
		const uri = formatBookBookmarkUri('library/book.epub', 'ch-1', 42);
		const block = formatBookmarkBlock({
			timestamp: new Date('2026-05-21T12:00:00Z'),
			passage: 'Sample passage.',
			positionLine: 'chapter ch-1 word 42',
			uriLine: uri
		});

		expect(block).toContain(`> \`${uri}\``);
		expect(block).not.toMatch(new RegExp(`\\n${uri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`));
	});

	it('wraps highlighted sentence in Obsidian highlight + bold italic', () => {
		const passage = formatPassageWithHighlight({
			paragraphText: 'The room was bright. The wheels were turning. A large room.',
			highlightedSentence: 'The wheels were turning.'
		});
		expect(passage).toContain('==***The wheels were turning.***==');
		expect(passage).not.toContain('==***The room');
	});

	it('appends highlighted sentence when no exact match', () => {
		const passage = formatPassageWithHighlight({
			paragraphText: 'Different paragraph text.',
			highlightedSentence: 'Missing sentence.'
		});
		expect(passage).toBe('Different paragraph text. ==***Missing sentence.***==');
	});

	it('escapes multi-line passage inside quote callout', () => {
		const block = formatBookmarkBlock({
			timestamp: new Date('2026-05-21T12:00:00Z'),
			passage: formatPassageWithHighlight({
				paragraphText: 'Line one.\nLine two.',
				highlightedSentence: 'Line one.'
			}),
			positionLine: 'section s word 0'
		});
		expect(block).toContain('> ==***Line one.***==');
		expect(block).toContain('> Line two.');
		expect(block).toContain('> [!quote] Passage');
	});

	it('builds book and note resume URIs with encoded paths', () => {
		expect(formatBookBookmarkUri('a b.epub', '12-preface', 33)).toBe(
			'speed-reader://book/a%20b.epub?chapter=12-preface&word=33'
		);
		expect(formatNoteBookmarkUri('notes/doc.md', 'section-01', 5)).toBe(
			'speed-reader://note/notes%2Fdoc.md?section=section-01&word=5'
		);
	});
});
