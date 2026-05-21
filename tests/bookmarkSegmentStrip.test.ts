import { describe, expect, it } from 'vitest';
import { normalizeDocument } from '../src/parse/normalizeSegments';
import { parseNoteSegments, parseSegments } from '../src/parse/segmentParser';
import { DEFAULT_SETTINGS } from '../src/types';

const HEADING = 'Speed Reader Bookmarks';

const settingsWithHeading = {
	bookmarks: { ...DEFAULT_SETTINGS.bookmarks, noteBookmarkSectionHeading: HEADING }
};

const NOTE_WITH_BOOKMARKS = `## Introduction

Body paragraph one.

Body paragraph two.

# ${HEADING}

> saved quote

Position: section intro word 3
`;

describe('bookmark segment strip', () => {
	it('parseNoteSegments excludes bookmark H1 region through EOF', () => {
		const parsed = parseNoteSegments(NOTE_WITH_BOOKMARKS, settingsWithHeading);

		const text = parsed.segments
			.flatMap((segment) => segment.lines)
			.join('\n');
		expect(text).toContain('Body paragraph one');
		expect(text).not.toContain(HEADING);
		expect(text).not.toContain('saved quote');
	});

	it('parseSegments strips when bookmarkSectionHeading option set', () => {
		const parsed = parseSegments(NOTE_WITH_BOOKMARKS, {
			bookmarkSectionHeading: HEADING
		});
		expect(parsed.segments.some((s) => s.lines.join('\n').includes(HEADING))).toBe(
			false
		);
	});

	it('normalizeDocument excludes bookmark content from bundle', () => {
		const parsed = parseNoteSegments(NOTE_WITH_BOOKMARKS, settingsWithHeading);
		const bundle = normalizeDocument(parsed, 'notes/test.md', 'checksum');
		const combined = bundle.sections
			.flatMap((section) => section.segments)
			.map((segment) => `${segment.title ?? ''} ${segment.body ?? ''}`)
			.join(' ');
		expect(combined).toContain('Introduction');
		expect(combined).not.toContain('saved quote');
	});
});
