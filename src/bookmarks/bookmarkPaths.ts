import type { SpeedReaderAiSettings } from '../types';

const BOOK_NAME_PLACEHOLDER = '{book_name}';

export function sanitizeBookName(epubSourcePath: string): string {
	const base = epubSourcePath.replace(/^.*[/\\]/, '').replace(/\.epub$/i, '').trim();
	const safe = base
		.replace(/[^\w. -]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return safe || 'book';
}

export function expandBookBookmarkTemplate(template: string, bookName: string): string {
	if (!template.includes(BOOK_NAME_PLACEHOLDER)) {
		throw new Error(`Book bookmark template must include ${BOOK_NAME_PLACEHOLDER}`);
	}
	return template.split(BOOK_NAME_PLACEHOLDER).join(bookName);
}

export function resolveBookBookmarkPath(
	settings: Pick<SpeedReaderAiSettings, 'bookmarks'>,
	epubSourcePath: string
): string {
	const bookName = sanitizeBookName(epubSourcePath);
	return expandBookBookmarkTemplate(settings.bookmarks.bookBookmarkNoteTemplate, bookName);
}

export function templateHasBookNamePlaceholder(template: string): boolean {
	return template.includes(BOOK_NAME_PLACEHOLDER);
}
