// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
	htmlToPlainText,
	parseEpubBytes,
	tokenizePlainWithParagraphStarts
} from '../src/formats/epub/epubParse';
import {
	parseEpubChapterIndexResponse,
	resolveChapterTitlesViaLlm
} from '../src/formats/epub/epubChapterIndexLlm';
import {
	areChapterTitlesUsable,
	detectSpecialPages,
	needsLlmTitles,
	resolveChapterTitle
} from '../src/formats/epub/epubTitleResolution';
import {
	mapNavEntriesToSpine,
	parseNavDocument,
	parseNcxDocument
} from '../src/formats/epub/epubNavigation';
import type { LlmClient } from '../src/llm/CursorCliClient';
import {
	buildMinimalEpubBytes,
	chaptersWithRepeatedBookTitle,
	type EpubNavEntry
} from './epubFixtures';

describe('epubTitleResolution', () => {
	it('uses Section N when title matches book metadata', () => {
		expect(resolveChapterTitle('Sample Book', undefined, 'Sample Book', 0)).toBe('Section 1');
	});

	it('keeps explicit CHAPTER labels from nav', () => {
		expect(resolveChapterTitle('CHAPTER I', undefined, 'Dorian Gray', 11)).toBe('CHAPTER I');
	});

	it('detects unusable duplicate chapter titles', () => {
		expect(areChapterTitlesUsable(['Chapter 1', 'Chapter 1', 'Chapter 1'], 'Book')).toBe(
			false
		);
		expect(areChapterTitlesUsable(['Chapter 1', 'Chapter 2', 'Cover'], 'Book')).toBe(true);
	});

	it('needs LLM when nav is partial', () => {
		const titles = new Map<number, string>([
			[0, 'Cover'],
			[1, 'Section 2']
		]);
		expect(
			needsLlmTitles({
				spineCount: 3,
				navMappedCount: 2,
				titlesBySpine: titles,
				spineItems: [{ spineIndex: 0 }, { spineIndex: 1 }, { spineIndex: 2 }]
			})
		).toBe(true);
	});

	it('needs LLM when spine-index Chapter fallback is present', () => {
		const titles = new Map<number, string>([
			[0, 'Cover'],
			[10, 'Chapter 11']
		]);
		expect(
			needsLlmTitles({
				spineCount: 12,
				navMappedCount: 12,
				titlesBySpine: titles,
				spineItems: Array.from({ length: 12 }, (_, i) => ({ spineIndex: i }))
			})
		).toBe(true);
	});
});

describe('epubNavigation', () => {
	it('parses EPUB3 nav TOC and maps to spine', () => {
		const navXml = `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><ol>
<li><a href="text/chapter1.xhtml">Alpha</a></li>
<li><a href="text/chapter2.xhtml">Beta</a></li>
</ol></nav></body></html>`;
		const entries = parseNavDocument(navXml, 'nav.xhtml', 'OEBPS');
		const mapped = mapNavEntriesToSpine(entries, [
			'text/chapter1.xhtml',
			'text/chapter2.xhtml'
		]);
		expect(mapped.get(0)).toBe('Alpha');
		expect(mapped.get(1)).toBe('Beta');
	});

	it('parses NCX navPoints and maps to spine', () => {
		const ncxXml = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
<navMap>
<navPoint id="n1" playOrder="1">
<navLabel><text>One</text></navLabel>
<content src="text/chapter1.xhtml"/>
</navPoint>
<navPoint id="n2" playOrder="2">
<navLabel><text>Two</text></navLabel>
<content src="text/chapter2.xhtml"/>
</navPoint>
</navMap>
</ncx>`;
		const entries = parseNcxDocument(ncxXml, 'toc.ncx', 'OEBPS');
		const mapped = mapNavEntriesToSpine(entries, [
			'text/chapter1.xhtml',
			'text/chapter2.xhtml'
		]);
		expect(mapped.get(0)).toBe('One');
		expect(mapped.get(1)).toBe('Two');
	});
});

describe('epubChapterIndexLlm', () => {
	it('parses valid chapter index JSON with kind', () => {
		const parsed = parseEpubChapterIndexResponse(
			'{"chapters":[{"spineIndex":0,"title":"Cover","kind":"cover"},{"spineIndex":2,"title":"CHAPTER I","kind":"body"}]}'
		);
		expect(parsed?.chapters).toHaveLength(2);
		expect(parsed?.chapters[0]?.kind).toBe('cover');
		expect(parsed?.chapters[1]?.title).toBe('CHAPTER I');
	});

	it('returns full spine maps from LLM', async () => {
		const llm: LlmClient = {
			complete: vi.fn().mockResolvedValue(
				JSON.stringify({
					chapters: [
						{ spineIndex: 0, title: 'Contents', kind: 'frontMatter' },
						{ spineIndex: 1, title: 'Preface', kind: 'frontMatter' },
						{ spineIndex: 2, title: 'CHAPTER I', kind: 'body' }
					]
				})
			)
		};

		const specialPages = detectSpecialPages([
			{
				spineIndex: 0,
				html: '<a href="ch1.xhtml">CHAPTER I</a>',
				plain: 'Table of Contents CHAPTER I'
			}
		]);

		const result = await resolveChapterTitlesViaLlm(llm, {
			bookTitle: 'My Book',
			spineSnapshots: [
				{ spineIndex: 0, path: 'text/contents.xhtml', currentTitle: 'Section 1', wordCount: 50 },
				{ spineIndex: 1, path: 'text/preface.xhtml', currentTitle: 'Chapter 2', wordCount: 200 },
				{ spineIndex: 2, path: 'text/ch1.xhtml', currentTitle: 'Chapter 3', wordCount: 800 }
			],
			specialPages
		});

		expect(result.titles.get(0)).toBe('Contents');
		expect(result.titles.get(1)).toBe('Preface');
		expect(result.titles.get(2)).toBe('CHAPTER I');
		expect(result.kinds.get(1)).toBe('frontMatter');
	});
});

describe('epubHtmlExtract', () => {
	it('preserves paragraph breaks between block elements', () => {
		const html = `<html><body>
<p>First paragraph here.</p>
<p>Second paragraph follows.</p>
</body></html>`;
		const plain = htmlToPlainText(html);
		expect(plain).toContain('\n\n');
		expect(plain).toContain('First paragraph here.');
		expect(plain).toContain('Second paragraph follows.');
	});

	it('records paragraphStarts when tokenizing plain text', () => {
		const { words, paragraphStarts } = tokenizePlainWithParagraphStarts(
			'First para.\n\nSecond para.'
		);
		expect(words.length).toBeGreaterThan(2);
		expect(paragraphStarts).toEqual([0, expect.any(Number)]);
		expect(paragraphStarts[1]).toBeGreaterThan(0);
	});
});

describe('epubParse', () => {
	it('stores paragraphStarts on parsed chapters', async () => {
		const bytes = await buildMinimalEpubBytes({
			chapters: [
				{
					id: 'ch1',
					href: 'text/chapter1.xhtml',
					title: 'Chapter',
					body: '<html><body><p>Alpha one.</p><p>Beta two.</p></body></html>'
				}
			],
			nav: [{ label: 'Chapter', href: 'text/chapter1.xhtml' }]
		});
		const { index } = await parseEpubBytes('books/paragraphs.epub', bytes);
		expect(index.chapters[0]?.paragraphStarts?.length).toBeGreaterThanOrEqual(2);
	});

	it('extracts title, author, chapter count, and word counts', async () => {
		const bytes = await buildMinimalEpubBytes({
			title: 'Test EPUB',
			author: 'Jane Doe',
			nav: [
				{ label: 'First Chapter', href: 'text/chapter1.xhtml' },
				{ label: 'Second Chapter', href: 'text/chapter2.xhtml' }
			]
		});
		const { index } = await parseEpubBytes('books/sample.epub', bytes);

		expect(index.title).toBe('Test EPUB');
		expect(index.author).toBe('Jane Doe');
		expect(index.sourcePath).toBe('books/sample.epub');
		expect(index.chapters).toHaveLength(2);
		expect(index.chapters[0]?.title).toBe('First Chapter');
		expect(index.chapters[0]?.wordCount).toBeGreaterThan(0);
		expect(index.totalWordCount).toBe(
			index.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
		);
		expect(index.sourceChecksum).toMatch(/^[a-f0-9]{64}$/);
	});

	it('uses stable docKey from source path', async () => {
		const bytes = await buildMinimalEpubBytes();
		const { index } = await parseEpubBytes('folder/book.epub', bytes);
		expect(index.docKey).toBeTruthy();
		expect(index.docKey).not.toContain('/');
	});

	it('uses EPUB3 nav labels instead of repeated HTML title tags', async () => {
		const nav: EpubNavEntry[] = [
			{ label: 'The Preface', href: 'text/chapter1.xhtml' },
			{ label: 'Chapter I', href: 'text/chapter2.xhtml' },
			{ label: 'Chapter II', href: 'text/chapter3.xhtml' }
		];
		const bytes = await buildMinimalEpubBytes({
			title: 'Dorian Gray',
			chapters: chaptersWithRepeatedBookTitle('Dorian Gray', 3),
			nav
		});
		const { index } = await parseEpubBytes('books/dorian.epub', bytes);

		expect(index.chapters[0]?.title).toBe('The Preface');
		expect(index.chapters[1]?.title).toBe('Chapter I');
		expect(index.chapters[2]?.title).toBe('Chapter II');
	});

	it('falls back to Section N when nav is missing and HTML titles repeat book title', async () => {
		const bytes = await buildMinimalEpubBytes({
			title: 'Dorian Gray',
			chapters: chaptersWithRepeatedBookTitle('Dorian Gray', 3)
		});
		const { index } = await parseEpubBytes('books/dorian.epub', bytes);

		expect(index.chapters[0]?.title).toBe('Section 1');
		expect(index.chapters[1]?.title).toBe('Section 2');
		expect(index.chapters[2]?.title).toBe('Section 3');
	});

	it('applies LLM titles on partial nav coverage', async () => {
		const bytes = await buildMinimalEpubBytes({
			title: 'Test Book',
			chapters: [
				{
					id: 'ch1',
					href: 'text/chapter1.xhtml',
					title: 'Ch1',
					body: '<html><head><title>Test Book</title></head><body><p>Words one two three.</p></body></html>'
				},
				{
					id: 'ch2',
					href: 'text/chapter2.xhtml',
					title: 'Ch2',
					body: '<html><head><title>Test Book</title></head><body><p>More words here now.</p></body></html>'
				},
				{
					id: 'ch3',
					href: 'text/chapter3.xhtml',
					title: 'Ch3',
					body: '<html><head><title>Test Book</title></head><body><p>Even more words here.</p></body></html>'
				}
			],
			nav: [{ label: 'CHAPTER I', href: 'text/chapter3.xhtml' }]
		});

		const llm: LlmClient = {
			complete: vi.fn().mockResolvedValue(
				JSON.stringify({
					chapters: [
						{ spineIndex: 0, title: 'Cover', kind: 'cover' },
						{ spineIndex: 1, title: 'Preface', kind: 'frontMatter' },
						{ spineIndex: 2, title: 'CHAPTER I', kind: 'body' }
					]
				})
			)
		};

		const { index } = await parseEpubBytes('books/partial.epub', bytes, { llm });

		expect(index.chapters[0]?.title).toBe('Cover');
		expect(index.chapters[1]?.title).toBe('Preface');
		expect(index.chapters[2]?.title).toBe('CHAPTER I');
		expect(llm.complete).toHaveBeenCalled();
	});

	it('uses NCX labels when nav document is absent', async () => {
		const ncx: EpubNavEntry[] = [
			{ label: 'Start', href: 'text/chapter1.xhtml' },
			{ label: 'Middle', href: 'text/chapter2.xhtml' }
		];
		const bytes = await buildMinimalEpubBytes({ ncx });
		const { index } = await parseEpubBytes('books/ncx.epub', bytes);

		expect(index.chapters[0]?.title).toBe('Start');
		expect(index.chapters[1]?.title).toBe('Middle');
	});

	it('marks cover chapter and extracts cover bytes', async () => {
		const bytes = await buildMinimalEpubBytes({
			coverHref: 'Images/cover.jpg',
			chapters: [
				{
					id: 'cover',
					href: 'text/cover.xhtml',
					title: 'Cover',
					body: '<html><body><img src="../Images/cover.jpg" alt="Cover"/></body></html>'
				},
				{
					id: 'ch1',
					href: 'text/chapter1.xhtml',
					title: 'Chapter 1',
					body: '<html><body><p>Story words begin here now.</p></body></html>'
				}
			],
			nav: [
				{ label: 'Cover', href: 'text/cover.xhtml' },
				{ label: 'Chapter 1', href: 'text/chapter1.xhtml' }
			]
		});

		const { index, coverBytes } = await parseEpubBytes('books/cover.epub', bytes);

		expect(index.chapters[0]?.isCover).toBe(true);
		expect(index.chapters[0]?.wordCount).toBe(0);
		expect(coverBytes).not.toBeNull();
		expect(coverBytes!.length).toBeGreaterThan(0);
	});
});
