import { describe, expect, it } from 'vitest';
import {
	formatBookBookmarkUri,
	formatBookmarkBlock,
	formatNoteBookmarkUri
} from '../src/bookmarks/bookmarkBlock';

describe('bookmarkBlock', () => {
	it('wraps resume URI in inline code so Obsidian does not autolink it', () => {
		const uri = formatBookBookmarkUri('library/book.epub', 'ch-1', 42);
		const block = formatBookmarkBlock({
			timestamp: new Date('2026-05-21T12:00:00Z'),
			passage: 'Sample passage.',
			positionLine: 'chapter ch-1 word 42',
			uriLine: uri
		});

		expect(block).toContain(`\`${uri}\``);
		expect(block).not.toContain(`\n${uri}\n`);
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
