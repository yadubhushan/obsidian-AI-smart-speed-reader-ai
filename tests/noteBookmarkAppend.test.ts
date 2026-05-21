import { describe, expect, it } from 'vitest';
import { appendNoteBookmark } from '../src/bookmarks/noteBookmarkAppend';

const HEADING = 'Speed Reader Bookmarks';

describe('appendNoteBookmark', () => {
	it('appends heading section and block when missing', () => {
		const body = '## Intro\n\nHello world.\n';
		const block = '## 2026-05-21 — Intro\n\n> quote\n\nPosition: section x word 1\n';
		const result = appendNoteBookmark(body, HEADING, block);
		expect(result).toContain('# Speed Reader Bookmarks');
		expect(result.endsWith(block)).toBe(true);
		expect(result.indexOf('Hello world.')).toBeLessThan(result.indexOf(HEADING));
	});

	it('only appends block when bookmark section already exists', () => {
		const body = `## Intro\n\nHello.\n\n# ${HEADING}\n\n> old\n`;
		const block = '## 2026-05-21 — Intro\n\n> new\n\nPosition: section x word 2\n';
		const result = appendNoteBookmark(body, HEADING, block);
		expect(result).toContain('> old');
		expect(result).toContain('> new');
		expect(result.split('Hello.')[0]).toBe('## Intro\n\n');
	});
});
