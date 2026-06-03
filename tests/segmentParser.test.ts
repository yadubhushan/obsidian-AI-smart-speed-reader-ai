import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import type { DocumentSegment, ParsedSegments } from '../src/parse/segmentTypes';
import {
	parseSegments,
	buildSections,
	findSegmentAtOffset,
	mapEditorOffsetToSegmentIndex,
	getSectionAtSegmentIndex,
	getSectionForEditorOffset
} from '../src/parse/segmentParser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OVERVIEW_MD_PATH = resolve(
	__dirname,
	'../../../../docs/Areas/software-dev/interview/design/13-cloud computing/overview.md'
);

function isExcludedSegment(segment: DocumentSegment): boolean {
	return segment.kind === 'frontmatter' && segment.meta?.excluded === true;
}

function assertSegmentSectionCoverage(parsed: ParsedSegments): void {
	for (let index = 0; index < parsed.segments.length; index++) {
		const segment = parsed.segments[index]!;
		if (isExcludedSegment(segment)) {
			expect(getSectionAtSegmentIndex(parsed.sections, index)).toBeNull();
			continue;
		}

		const matches = parsed.sections.filter(
			(section) => index >= section.segmentStart && index < section.segmentEnd
		);
		expect(matches).toHaveLength(1);
	}
}

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

describe('parseSegments', () => {
	it('parses multi-section note with H2 headings', () => {
		const result = parseSegments(OVERVIEW_EXCERPT);
		const headings = result.segments.filter((s) => s.kind === 'heading');

		expect(headings).toHaveLength(2);
		expect(headings[0]?.meta?.level).toBe(2);
		expect(headings[0]?.lines[0]).toBe('## AWS vs GCP');
		expect(headings[1]?.lines[0]).toBe('## Networking');
	});

	it('captures three-column table as single segment', () => {
		const markdown = `| Service | AWS | GCP |
| --- | --- | --- |
| Compute | EC2 | Compute Engine |
| Storage | S3 | Cloud Storage |`;

		const result = parseSegments(markdown);
		const tables = result.segments.filter((s) => s.kind === 'table');

		expect(tables).toHaveLength(1);
		expect(tables[0]?.lines).toHaveLength(4);
		expect(tables[0]?.lines[0]).toContain('Service');
	});

	it('captures callouts with calloutType meta', () => {
		const markdown = `> [!note] Note title
> Note body

> [!tip] Tip title
> Tip body

> [!warning] Warning title
> Warning body`;

		const result = parseSegments(markdown);
		const callouts = result.segments.filter((s) => s.kind === 'callout');

		expect(callouts).toHaveLength(3);
		expect(callouts[0]?.meta?.calloutType).toBe('note');
		expect(callouts[1]?.meta?.calloutType).toBe('tip');
		expect(callouts[2]?.meta?.calloutType).toBe('warning');
	});

	it('keeps wikilink and markdown link lines in paragraphs', () => {
		const markdown = `See [[Some Note|Display Text]] for details.
Read [official docs](https://example.com) next.`;

		const result = parseSegments(markdown);
		const paragraphs = result.segments.filter((s) => s.kind === 'paragraph');

		expect(paragraphs).toHaveLength(1);
		expect(paragraphs[0]?.lines[0]).toContain('[[Some Note|Display Text]]');
		expect(paragraphs[0]?.lines[1]).toContain('[official docs](https://example.com)');
	});

	it('detects standalone embed and image segments', () => {
		const markdown = `![Architecture](diagram.png)

![[network-topology]]`;

		const result = parseSegments(markdown);
		const kinds = result.segments.map((s) => s.kind);

		expect(kinds).toEqual(['image', 'embed']);
	});

	it('captures frontmatter with excluded meta', () => {
		const markdown = `---
title: My Note
tags: [test]
---

Body text`;

		const result = parseSegments(markdown);
		const frontmatter = result.segments.find((s) => s.kind === 'frontmatter');

		expect(frontmatter).toBeDefined();
		expect(frontmatter?.meta?.excluded).toBe(true);
		expect(result.segments.some((s) => s.kind === 'paragraph')).toBe(true);
	});

	it('returns ordered non-overlapping segments', () => {
		const result = parseSegments(OVERVIEW_EXCERPT);

		for (let index = 1; index < result.segments.length; index++) {
			const prev = result.segments[index - 1];
			const current = result.segments[index];
			expect(current?.start).toBeGreaterThanOrEqual(prev?.end ?? 0);
		}
	});

	it('sets sourceLength to normalized text length', () => {
		const text = 'Hello\r\nWorld';
		const result = parseSegments(text);
		expect(result.sourceLength).toBe('Hello\nWorld'.length);
	});
});

describe('findSegmentAtOffset', () => {
	const markdown = `## Title

First paragraph.

Second paragraph.`;

	it('finds segment at known offset', () => {
		const { segments } = parseSegments(markdown);
		const headingOffset = markdown.indexOf('## Title');
		const paragraphOffset = markdown.indexOf('First paragraph');

		expect(findSegmentAtOffset(segments, headingOffset)).toBe(0);
		expect(findSegmentAtOffset(segments, paragraphOffset)).toBe(1);
	});

	it('returns last segment index at EOF', () => {
		const { segments } = parseSegments(markdown);
		expect(findSegmentAtOffset(segments, markdown.length)).toBe(segments.length - 1);
	});

	it('returns -1 for empty segments', () => {
		expect(findSegmentAtOffset([], 0)).toBe(-1);
	});
});

describe('mapEditorOffsetToSegmentIndex', () => {
	it('returns -1 for cursor inside excluded frontmatter', () => {
		const markdown = `---
title: Test
---

Body`;

		const { segments } = parseSegments(markdown);
		const frontmatterOffset = markdown.indexOf('title');

		expect(mapEditorOffsetToSegmentIndex(segments, frontmatterOffset)).toBe(-1);
	});

	it('returns segment index for body content', () => {
		const markdown = `---
title: Test
---

Body text here`;

		const { segments } = parseSegments(markdown);
		const bodyOffset = markdown.indexOf('Body text');

		expect(mapEditorOffsetToSegmentIndex(segments, bodyOffset)).toBeGreaterThanOrEqual(0);
		expect(segments[mapEditorOffsetToSegmentIndex(segments, bodyOffset)!]?.kind).toBe(
			'paragraph'
		);
	});

	it('matches findSegmentAtOffset for non-excluded segments', () => {
		const markdown = '## Heading\n\nParagraph text';
		const { segments } = parseSegments(markdown);
		const offset = markdown.indexOf('Paragraph');

		expect(mapEditorOffsetToSegmentIndex(segments, offset)).toBe(
			findSegmentAtOffset(segments, offset)
		);
	});
});

describe('sections', () => {
	it('groups OVERVIEW_EXCERPT into two H2 sections without preamble', () => {
		const result = parseSegments(OVERVIEW_EXCERPT);

		expect(result.sections).toHaveLength(2);
		expect(result.sections[0]?.title).toBe('AWS vs GCP');
		expect(result.sections[1]?.title).toBe('Networking');
		expect(result.sections[0]?.segmentStart).toBe(
			result.segments.findIndex(
				(s) => s.kind === 'heading' && s.lines[0] === '## AWS vs GCP'
			)
		);
	});

	it('returns single implicit section for notes without H2', () => {
		const simple = 'This is a short note.\n\nJust two paragraphs of plain text.';
		const result = parseSegments(simple);

		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]?.id).toBe('00-document');
		expect(result.sections[0]?.title).toBe('This is a short note.');
	});

	it('uses fileName stem for implicit section title when provided', () => {
		const result = parseSegments('Plain body only.', { fileName: 'overview.md' });

		expect(result.sections[0]?.id).toBe('00-document');
		expect(result.sections[0]?.title).toBe('overview');
	});

	it('creates preamble section before first H2', () => {
		const markdown = `# Document Title

Intro paragraph before sections.

## First

Section one body.

## Second

Section two body.`;

		const result = parseSegments(markdown);

		expect(result.sections).toHaveLength(3);
		expect(result.sections[0]?.id).toBe('00-preamble');
		expect(result.sections[0]?.title).toBe('Document Title');
		expect(result.sections[1]?.title).toBe('First');
		expect(result.sections[2]?.title).toBe('Second');
	});

	it('assigns every non-excluded segment to exactly one section', () => {
		assertSegmentSectionCoverage(parseSegments(OVERVIEW_EXCERPT));
		assertSegmentSectionCoverage(
			parseSegments('# Title\n\n## One\n\nBody.\n\n## Two\n\nMore.')
		);
	});

	it('overview.md yields sections when fixture is available', () => {
		if (!existsSync(OVERVIEW_MD_PATH)) {
			return;
		}

		const text = readFileSync(OVERVIEW_MD_PATH, 'utf-8');
		const result = parseSegments(text, { fileName: 'overview.md' });

		expect(result.sections).toHaveLength(6);
		assertSegmentSectionCoverage(result);
	});
});

describe('getSectionAtSegmentIndex', () => {
	const markdown = `# Preamble

Intro.

## Alpha

Alpha body.

## Beta

Beta body.`;

	it('returns section for segment inside range', () => {
		const parsed = parseSegments(markdown);
		const alphaHeadingIndex = parsed.segments.findIndex(
			(s) => s.lines[0] === '## Alpha'
		);

		const section = getSectionAtSegmentIndex(
			parsed.sections,
			alphaHeadingIndex
		);
		expect(section?.title).toBe('Alpha');
	});

	it('returns null for excluded frontmatter segment index', () => {
		const parsed = parseSegments(`---
title: Test
---

## Body

Text.`);
		const frontmatterIndex = parsed.segments.findIndex(
			(s) => s.kind === 'frontmatter'
		);

		expect(getSectionAtSegmentIndex(parsed.sections, frontmatterIndex)).toBeNull();
	});
});

describe('getSectionForEditorOffset', () => {
	const markdown = `## First

First section text.

## Second

Second section text.`;

	it('maps offset in second section to that section', () => {
		const parsed = parseSegments(markdown);
		const offset = markdown.indexOf('Second section');

		const match = getSectionForEditorOffset(parsed, offset);
		expect(match?.section.title).toBe('Second');
		expect(match?.sectionIndex).toBe(1);
	});

	it('returns null for offset inside excluded frontmatter', () => {
		const parsed = parseSegments(`---
title: Test
---

Body text`);

		const offset = parsed.segments[0]!.start + 2;
		expect(getSectionForEditorOffset(parsed, offset)).toBeNull();
	});
});

describe('buildSections', () => {
	it('can be called independently of parseSegments', () => {
		const { segments } = parseSegments('## Only\n\nBody.');
		const sections = buildSections(segments);

		expect(sections).toHaveLength(1);
		expect(sections[0]?.title).toBe('Only');
	});
});

describe('manual verification fixtures', () => {
	it('overview excerpt: table is single segment, callout typed', () => {
		const result = parseSegments(OVERVIEW_EXCERPT);

		const tables = result.segments.filter((s) => s.kind === 'table');
		expect(tables).toHaveLength(1);
		expect(tables[0]?.lines.length).toBeGreaterThanOrEqual(3);

		const callout = result.segments.find((s) => s.kind === 'callout');
		expect(callout?.meta?.calloutType).toBe('note');
	});

	it('simple prose note: paragraph segments only', () => {
		const simple = 'This is a short note.\n\nJust two paragraphs of plain text.';
		const result = parseSegments(simple);

		expect(result.segments.every((s) => s.kind === 'paragraph')).toBe(true);
	});
});
