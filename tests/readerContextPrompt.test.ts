import { describe, expect, it } from 'vitest';
import { buildReaderContextPrompt } from '../src/ui/readerContextPrompt';

describe('readerContextPrompt', () => {
	it('builds a prompt with previous paragraphs and the current paragraph', () => {
		const prompt = buildReaderContextPrompt({
			sourceTitle: 'Dune',
			sourceKind: 'Book',
			chapterLabel: 'Chapter 7 of 22',
			chapterTitle: 'Arrakis',
			sectionProgressLabel: 'Chapter 7 of 22',
			previousParagraphs: [' First paragraph. ', 'Second   paragraph.'],
			currentParagraph: ' Current paragraph. '
		});

		expect(prompt).toContain('I\'m reading "Dune".');
		expect(prompt).toContain('Reading metadata:');
		expect(prompt).toContain('Source type: Book');
		expect(prompt).toContain('Title: Dune');
		expect(prompt).toContain('Chapter 7 of 22: Arrakis');
		expect(prompt).toContain('Location: Chapter 7 of 22');
		expect(prompt).toContain('Previous paragraph 1:\nFirst paragraph.');
		expect(prompt).toContain('Previous paragraph 2:\nSecond paragraph.');
		expect(prompt).toContain('Current paragraph:\nCurrent paragraph.');
	});
});
