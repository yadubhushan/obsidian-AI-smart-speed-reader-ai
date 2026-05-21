import { describe, expect, it } from 'vitest';
import {
	expandBookBookmarkTemplate,
	resolveBookBookmarkPath,
	sanitizeBookName,
	templateHasBookNamePlaceholder
} from '../src/bookmarks/bookmarkPaths';
import { DEFAULT_SETTINGS } from '../src/types';

describe('bookmarkPaths', () => {
	it('sanitizes epub basename for filesystem-safe book name', () => {
		expect(sanitizeBookName('My Book (2024).epub')).toBe('My Book 2024');
		expect(sanitizeBookName('weird!!!.epub')).toBe('weird');
	});

	it('expands {book_name} in template', () => {
		expect(
			expandBookBookmarkTemplate('docs/books/{book_name}.md', 'Dune')
		).toBe('docs/books/Dune.md');
	});

	it('throws when template omits {book_name}', () => {
		expect(() => expandBookBookmarkTemplate('docs/books/fixed.md', 'X')).toThrow(
			/{book_name}/
		);
	});

	it('resolves vault path from settings and epub path', () => {
		const path = resolveBookBookmarkPath(
			{
				bookmarks: {
					...DEFAULT_SETTINGS.bookmarks,
					bookBookmarkNoteTemplate: 'docs/Areas/books/bookmarks/{book_name}.md'
				}
			},
			'library/Dune.epub'
		);
		expect(path).toBe('docs/Areas/books/bookmarks/Dune.md');
	});

	it('detects book name placeholder', () => {
		expect(templateHasBookNamePlaceholder('{book_name}')).toBe(true);
		expect(templateHasBookNamePlaceholder('fixed.md')).toBe(false);
	});
});
