import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { parseSegments } from '../src/parse/segmentParser';
import {
	normalizeCalloutLines,
	normalizeDocument,
	normalizeSegment,
	normalizeTableLines,
	resolveLinksInText
} from '../src/parse/normalizeSegments';
import type { NormalizedDocumentBundle } from '../src/parse/normalizeTypes';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OVERVIEW_MD_PATH = resolve(
	__dirname,
	'../../../../docs/Areas/software-dev/interview/design/13-cloud computing/overview.md'
);
const TEST_CHECKSUM = 'test-checksum-stub';
const TEST_SOURCE_PATH = 'docs/overview.md';

const OVERVIEW_EXCERPT = `---
title: Cloud Overview
tags: [interview]
---

## AWS vs GCP

Comparison of major cloud providers for interview prep.

| Service | AWS | GCP |
| --- | --- | --- |
| Compute | EC2 | Compute Engine |
| Storage | S3 | Cloud Storage |

> [!note] Key insight
> EC2 and Compute Engine are the primary VM offerings.

## Networking

See [[VPC Guide|VPC networking]] and [AWS docs](https://aws.amazon.com).

![Architecture diagram](architecture.png)

![[network-topology]]
`;

function normalizeExcerpt(): NormalizedDocumentBundle {
	const parsed = parseSegments(OVERVIEW_EXCERPT);
	return normalizeDocument(parsed, TEST_SOURCE_PATH, TEST_CHECKSUM);
}

function allSegments(bundle: NormalizedDocumentBundle) {
	return bundle.sections.flatMap((section) => section.segments);
}

function tableCells(bundle: NormalizedDocumentBundle): string[] {
	return allSegments(bundle)
		.filter((segment) => segment.table)
		.flatMap((segment) => [
			...(segment.table?.headers ?? []),
			...(segment.table?.rows.flat() ?? [])
		]);
}

describe('normalizeTableLines', () => {
	it('parses headers and rows without pipe characters in cells', () => {
		const table = normalizeTableLines([
			'| Service | AWS | GCP |',
			'| --- | --- | --- |',
			'| Compute | EC2 | Compute Engine |',
			'| Storage | S3 | Cloud Storage |'
		]);

		expect(table.headers).toEqual(['Service', 'AWS', 'GCP']);
		expect(table.rows).toEqual([
			['Compute', 'EC2', 'Compute Engine'],
			['Storage', 'S3', 'Cloud Storage']
		]);

		for (const cell of [...table.headers, ...table.rows.flat()]) {
			expect(cell).not.toContain('|');
		}
	});

	it('drops empty trailing columns from ragged rows', () => {
		const table = normalizeTableLines([
			'| A | B |',
			'| --- | --- |',
			'| one | two |   |'
		]);

		expect(table.headers).toEqual(['A', 'B']);
		expect(table.rows[0]).toEqual(['one', 'two']);
	});
});

describe('normalizeCalloutLines', () => {
	it('extracts title and multi-line body without blockquote markers', () => {
		const callout = normalizeCalloutLines([
			'> [!note] Key insight',
			'> EC2 and Compute Engine are the primary VM offerings.'
		]);

		expect(callout.title).toBe('Key insight');
		expect(callout.body).toContain('EC2 and Compute Engine');
		expect(callout.body).not.toContain('>');
	});
});

describe('resolveLinksInText', () => {
	it('resolves wikilink display text and markdown link anchors', () => {
		const text = resolveLinksInText(
			'See [[VPC Guide|VPC networking]] and [AWS docs](https://aws.amazon.com).'
		);

		expect(text).toContain('VPC networking');
		expect(text).not.toContain('[[');
		expect(text).toContain('AWS docs');
		expect(text).not.toContain('https://');
	});

	it('uses target when wikilink has no display alias', () => {
		expect(resolveLinksInText('Link [[Some Note]] here.')).toBe('Link Some Note here.');
	});
});

describe('normalizeDocument', () => {
	it('normalizes overview excerpt table, callout, links, and image', () => {
		const bundle = normalizeExcerpt();
		const segments = allSegments(bundle);

		const table = segments.find((segment) => segment.table);
		expect(table?.table?.headers).toEqual(['Service', 'AWS', 'GCP']);
		expect(tableCells(bundle).every((cell) => !cell.includes('|'))).toBe(true);

		const callout = segments.find((segment) => segment.kind === 'callout');
		expect(callout?.title).toBe('Key insight');
		expect(callout?.body).toContain('EC2 and Compute Engine');

		const networkingBody = segments.find(
			(segment) => segment.kind === 'paragraph' && segment.body?.includes('VPC')
		);
		expect(networkingBody?.body).toContain('VPC networking');
		expect(networkingBody?.body).not.toContain('[[');

		const image = segments.find((segment) => segment.kind === 'image');
		expect(image?.imageAlt).toBe('Architecture diagram');
		expect(image?.suggestedPauseMs).toBeGreaterThan(0);
	});

	it('marks frontmatter as skipped via normalizeSegment', () => {
		const parsed = parseSegments('---\ntitle: Test\n---\n\nBody.');
		const frontmatter = parsed.segments.find((segment) => segment.kind === 'frontmatter');
		expect(frontmatter).toBeDefined();
		expect(normalizeSegment(frontmatter!, 0).skip).toBe(true);
	});

	it('marks code blocks as skipped when present in sections', () => {
		const markdown = `---
title: Test
---

\`\`\`ts
const x = 1;
\`\`\`

## Section

Body text.`;
		const parsed = parseSegments(markdown);
		const bundle = normalizeDocument(parsed, TEST_SOURCE_PATH, TEST_CHECKSUM);
		const skipped = allSegments(bundle).filter((segment) => segment.skip);

		expect(skipped.some((segment) => segment.kind === 'code_block')).toBe(true);
		expect(
			skipped.filter((segment) => segment.kind === 'frontmatter')
		).toHaveLength(0);
	});

	it('includes all source sections in bundle', () => {
		const parsed = parseSegments(OVERVIEW_EXCERPT);
		const bundle = normalizeDocument(parsed, TEST_SOURCE_PATH, TEST_CHECKSUM);

		expect(bundle.sections).toHaveLength(parsed.sections.length);
		expect(bundle.sourcePath).toBe(TEST_SOURCE_PATH);
		expect(bundle.sourceChecksum).toBe(TEST_CHECKSUM);
	});

	it('serializes without circular references and matches payload estimates', () => {
		const bundle = normalizeExcerpt();
		const serialized = JSON.stringify(bundle);

		expect(() => JSON.parse(serialized)).not.toThrow();
		expect(bundle.estimatedPayloadChars).toBe(serialized.length);
		expect(bundle.estimatedPayloadLines).toBe(serialized.split('\n').length);
	});

	it('assigns per-section segment indexes starting at zero', () => {
		const bundle = normalizeExcerpt();

		for (const section of bundle.sections) {
			section.segments.forEach((segment, index) => {
				expect(segment.index).toBe(index);
			});
		}
	});

	it('parses embed target with suggested pause', () => {
		const bundle = normalizeExcerpt();
		const embed = allSegments(bundle).find((segment) => segment.kind === 'embed');

		expect(embed?.embedTarget).toBe('network-topology');
		expect(embed?.suggestedPauseMs).toBeGreaterThan(0);
	});
});

describe('overview.md integration', () => {
	it('produces bundle for full overview.md when fixture is available', () => {
		if (!existsSync(OVERVIEW_MD_PATH)) {
			return;
		}

		const text = readFileSync(OVERVIEW_MD_PATH, 'utf-8');
		const parsed = parseSegments(text, { fileName: 'overview.md' });
		const bundle = normalizeDocument(
			parsed,
			'docs/Areas/software-dev/interview/design/13-cloud computing/overview.md',
			TEST_CHECKSUM
		);

		expect(bundle.sections).toHaveLength(6);
		expect(bundle.estimatedPayloadChars).toBe(JSON.stringify(bundle).length);
		expect(tableCells(bundle).every((cell) => !cell.includes('|'))).toBe(true);
	});
});
