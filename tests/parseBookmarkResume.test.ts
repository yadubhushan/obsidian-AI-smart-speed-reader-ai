import { describe, expect, it } from 'vitest';
import {
	parseBookmarkPositionLine,
	parseBookmarkResumeUri
} from '../src/bookmarks/parseBookmarkResume';

describe('parseBookmarkResumeUri', () => {
	it('parses book resume URIs', () => {
		const uri = 'speed-reader://book/library%2Fbook.epub?chapter=ch-02&word=1842';
		expect(parseBookmarkResumeUri(uri)).toEqual({
			kind: 'book',
			sourcePath: 'library/book.epub',
			position: { chapterId: 'ch-02', wordIndex: 1842 }
		});
	});

	it('parses note resume URIs', () => {
		const uri = 'speed-reader://note/notes%2Fchapter.md?section=section-01&word=42';
		expect(parseBookmarkResumeUri(uri)).toEqual({
			kind: 'note',
			sourcePath: 'notes/chapter.md',
			position: { sectionId: 'section-01', wordIndex: 42 }
		});
	});

	it('returns null for invalid URIs', () => {
		expect(parseBookmarkResumeUri('https://example.com')).toBeNull();
	});
});

describe('parseBookmarkPositionLine', () => {
	it('parses book position lines with middle dot', () => {
		expect(parseBookmarkPositionLine('chapter ch-02 · word 1842', 'book')).toEqual({
			chapterId: 'ch-02',
			wordIndex: 1842
		});
	});

	it('parses book position lines with plain word separator', () => {
		expect(parseBookmarkPositionLine('chapter ch-02 word 1842', 'book')).toEqual({
			chapterId: 'ch-02',
			wordIndex: 1842
		});
	});

	it('parses note position lines', () => {
		expect(parseBookmarkPositionLine('section section-01 · word 12', 'note')).toEqual({
			sectionId: 'section-01',
			wordIndex: 12
		});
	});
});
