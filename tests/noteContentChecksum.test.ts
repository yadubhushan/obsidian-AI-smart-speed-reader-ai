import { describe, expect, it } from 'vitest';
import { noteContentChecksum } from '../src/crypto-checksum';
import { readableNoteBody } from '../src/parse/segmentParser';

const HEADING = 'Speed Reader Bookmarks';

const BODY_ONLY = `## Introduction

Body paragraph one.

Body paragraph two.
`;

const NOTE_WITH_BOOKMARKS = `${BODY_ONLY}

# ${HEADING}

> saved quote

Position: section intro word 3
`;

describe('noteContentChecksum', () => {
	it('readableNoteBody excludes bookmark section', () => {
		const body = readableNoteBody(NOTE_WITH_BOOKMARKS, HEADING);
		expect(body).toContain('Body paragraph one');
		expect(body).not.toContain(HEADING);
		expect(body).not.toContain('saved quote');
	});

	it('same checksum when another bookmark block is appended below existing section', async () => {
		const withAnotherBlock = `${NOTE_WITH_BOOKMARKS}\n\n---\n\nSecond bookmark block`;
		const before = await noteContentChecksum(NOTE_WITH_BOOKMARKS, HEADING);
		const after = await noteContentChecksum(withAnotherBlock, HEADING);
		expect(after).toBe(before);
	});

	it('checksum changes when main body edits', async () => {
		const original = await noteContentChecksum(BODY_ONLY, HEADING);
		const edited = await noteContentChecksum(
			`${BODY_ONLY}\n\nNew paragraph.`,
			HEADING
		);
		expect(edited).not.toBe(original);
	});
});
