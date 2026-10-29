// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EPUB_PARSER_VERSION, parseEpubBytes } from '../src/formats/epub/epubParse';
import { cleanTitleText, firstLineTitle } from '../src/formats/epub/epubTitleResolution';
import { buildChapterId, resolveBookPosition } from '../src/formats/bookChapterIds';
import { bookPositionFromReadingState } from '../src/formats/bookIndexToProcessedDocument';
import type { LlmClient } from '../src/llm/LlmClient';
import type { BookCacheIndex } from '../src/types/m2Contracts';
import { buildMinimalEpubBytes } from './epubFixtures';

function words(n: number, prefix: string): string {
	return Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
}

const TWO_PART_FILE = `<html><body>
<h2 id="p1">PART ONE</h2><p>${words(1200, 'one')}</p>
<h2 id="p2">PART TWO</h2><p>${words(1400, 'two')}</p>
</body></html>`;

describe('cleanTitleText', () => {
	it('strips HTML a converter escaped into a TOC label', () => {
		expect(
			cleanTitleText(
				'<a id="page_15" name="page_15"></a> <a id="chapI" name=\n "chapI"></a>Chapter One<br />\n THE UNDERGROUND'
			)
		).toBe('Chapter One: THE UNDERGROUND');
	});

	it('joins a line break inside a sentence with a space', () => {
		expect(cleanTitleText('What’s next on<br/>your reading list?')).toBe(
			'What’s next on your reading list?'
		);
	});

	it('collapses whitespace in plain labels', () => {
		expect(cleanTitleText('  CHAPTER I\n   THE THEME ')).toBe('CHAPTER I THE THEME');
	});
});

describe('firstLineTitle', () => {
	it('names a page by a short opening line', () => {
		expect(firstLineTitle('Also by Ayn Rand\n\nThe Fountainhead', 'Atlas Shrugged')).toBe(
			'Also by Ayn Rand'
		);
	});

	it('ignores prose, numbers and the book title', () => {
		expect(firstLineTitle(words(20, 'w'), 'Book')).toBeUndefined();
		expect(firstLineTitle('7', 'Book')).toBeUndefined();
		expect(firstLineTitle('She looked down.', 'Book')).toBeUndefined();
		expect(firstLineTitle('Atlas Shrugged Ayn Rand', 'Atlas Shrugged')).toBeUndefined();
		expect(firstLineTitle('FOR THE NEW', 'For the New Intellectual')).toBeUndefined();
	});

	it('drops a footnote marker glued to the title', () => {
		expect(firstLineTitle('THE PREFACE1\n\nThe artist is', 'Dorian Gray')).toBe('THE PREFACE');
	});
});

describe('parseEpubBytes index repair', () => {
	it('cleans HTML-escaped NCX labels', async () => {
		const bytes = await buildMinimalEpubBytes({
			ncx: [
				{
					label: '&lt;a id=&quot;con&quot;&gt;&lt;/a&gt;CONTENTS',
					href: 'text/chapter1.xhtml'
				},
				{
					label: '&lt;a id=&quot;chapI&quot;&gt;&lt;/a&gt;Chapter One&lt;br /&gt;\n THE UNDERGROUND',
					href: 'text/chapter2.xhtml'
				}
			]
		});
		const { index } = await parseEpubBytes('books/escaped.epub', bytes);

		expect(index.chapters.map((c) => c.title)).toEqual([
			'CONTENTS',
			'Chapter One: THE UNDERGROUND'
		]);
		expect(index.chapters[1]?.chapterId).toBe('02-chapter-one-the-underground');
		expect(index.parserVersion).toBe(EPUB_PARSER_VERSION);
	});

	it('splits one file into the chapters its TOC anchors name', async () => {
		const bytes = await buildMinimalEpubBytes({
			chapters: [{ id: 'split', href: 'text/split.xhtml', title: 'x', body: TWO_PART_FILE }],
			ncx: [
				{ label: 'PART ONE', href: 'text/split.xhtml#p1' },
				{ label: 'PART TWO', href: 'text/split.xhtml#p2' }
			]
		});
		const { index } = await parseEpubBytes('books/split.epub', bytes);

		expect(index.chapters.map((c) => [c.chapterId, c.title, c.wordCount])).toEqual([
			['01-part-one', 'PART ONE', 1202],
			['01.2-part-two', 'PART TWO', 1402]
		]);
		expect(index.totalWordCount).toBe(2604);
	});

	it('keeps a file whole when its anchors mark short sections', async () => {
		const body = `<html><body>${Array.from(
			{ length: 6 },
			(_, i) => `<h3 id="a${i}">${i + 1}. Aphorism</h3><p>${words(200, `a${i}`)}</p>`
		).join('')}</body></html>`;
		const bytes = await buildMinimalEpubBytes({
			chapters: [{ id: 'book', href: 'text/book.xhtml', title: 'x', body }],
			ncx: [
				{ label: 'Book One', href: 'text/book.xhtml' },
				...Array.from({ length: 6 }, (_, i) => ({
					label: `${i + 1}. A much longer aphorism label ${i}`,
					href: `text/book.xhtml#a${i}`
				}))
			]
		});
		const { index } = await parseEpubBytes('books/aphorisms.epub', bytes);

		expect(index.chapters.map((c) => c.title)).toEqual(['Book One']);
	});

	it('names text before the first anchor as the previous chapter continued', async () => {
		const tail = `<html><body><p>${words(60, 'tail')}</p>${TWO_PART_FILE.slice(12)}`;
		const bytes = await buildMinimalEpubBytes({
			chapters: [
				{
					id: 'ch1',
					href: 'text/chapter1.xhtml',
					title: 'x',
					body: `<html><body><p>${words(10, 'z')}</p></body></html>`
				},
				{ id: 'split', href: 'text/split.xhtml', title: 'x', body: tail }
			],
			ncx: [
				{ label: 'PART ZERO', href: 'text/chapter1.xhtml' },
				{ label: 'PART ONE', href: 'text/split.xhtml#p1' },
				{ label: 'PART TWO', href: 'text/split.xhtml#p2' }
			]
		});
		const { index } = await parseEpubBytes('books/leadin.epub', bytes);

		expect(index.chapters.map((c) => [c.chapterId, c.wordCount])).toEqual([
			['01-part-zero', 10],
			['02-part-zero-continued', 60],
			['02.2-part-one', 1202],
			['02.3-part-two', 1402]
		]);
	});

	it('does not split a chapter on numbered sub-section anchors', async () => {
		const bytes = await buildMinimalEpubBytes({
			chapters: [{ id: 'split', href: 'text/split.xhtml', title: 'x', body: TWO_PART_FILE }],
			ncx: [
				{ label: 'Chapter One', href: 'text/split.xhtml' },
				{ label: '2', href: 'text/split.xhtml#p1' },
				{ label: '3', href: 'text/split.xhtml#p2' }
			]
		});
		const { index } = await parseEpubBytes('books/numbered.epub', bytes);
		expect(index.chapters.map((c) => c.title)).toEqual(['Chapter One']);
	});

	it('names a lead-in after the TOC entry that points at the file', async () => {
		const body = `<html><body><p>${words(60, 'nine')}</p>${TWO_PART_FILE.slice(12)}`;
		const bytes = await buildMinimalEpubBytes({
			chapters: [{ id: 'split', href: 'text/split.xhtml', title: 'x', body }],
			ncx: [
				{ label: 'Chapter Nine', href: 'text/split.xhtml' },
				{ label: 'Chapter Ten', href: 'text/split.xhtml#p1' },
				{ label: 'Chapter Eleven', href: 'text/split.xhtml#p2' }
			]
		});
		const { index } = await parseEpubBytes('books/leadin-label.epub', bytes);
		expect(index.chapters.map((c) => c.title)).toEqual([
			'Chapter Nine',
			'Chapter Ten',
			'Chapter Eleven'
		]);
	});

	it('keeps earlier titles instead of re-running AI naming', async () => {
		const bytes = await buildMinimalEpubBytes({
			chapters: [
				{
					id: 'ch1',
					href: 'text/chapter1.xhtml',
					title: 'x',
					body: `<html><body><p>${words(30, 'a')}</p></body></html>`
				}
			]
		});
		const previousIndex = {
			chapters: [{ chapterId: '01-the-beginning', title: 'The Beginning' }]
		} as BookCacheIndex;
		const llm = { complete: vi.fn() } as unknown as LlmClient;

		const { index } = await parseEpubBytes('books/carry.epub', bytes, { llm, previousIndex });

		expect(index.chapters[0]?.title).toBe('The Beginning');
		expect(llm.complete).not.toHaveBeenCalled();
	});
});

describe('resolveBookPosition', () => {
	const index = {
		chapters: [
			{ chapterId: buildChapterId(0, 0, 'Cover'), wordCount: 0 },
			{ chapterId: buildChapterId(1, 0, 'PART ONE'), wordCount: 100 },
			{ chapterId: buildChapterId(1, 1, 'PART TWO'), wordCount: 50 }
		]
	} as BookCacheIndex;

	it('maps a pre-split position into the right part', () => {
		expect(resolveBookPosition(index, { chapterId: '02-part-one', wordIndex: 120 })).toEqual({
			chapterIndex: 2,
			wordIndex: 20
		});
	});

	it('maps a renamed chapter by its spine number', () => {
		expect(resolveBookPosition(index, { chapterId: '02-section-2', wordIndex: 5 })).toEqual({
			chapterIndex: 1,
			wordIndex: 5
		});
	});

	it('rewrites the saved position to the current chapter id', () => {
		expect(
			bookPositionFromReadingState(index, {
				chapterId: '02-a-id-page-15-part-one',
				wordIndex: 130
			})
		).toEqual({ chapterId: '02.2-part-two', wordIndex: 30 });
	});

	it('returns null for ids with no spine number', () => {
		expect(resolveBookPosition(index, { chapterId: 'chapter-01', wordIndex: 0 })).toBeNull();
	});
});
