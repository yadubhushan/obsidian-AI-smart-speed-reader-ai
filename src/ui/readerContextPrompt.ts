export interface ReaderContextPromptInput {
	sourceTitle: string;
	sourceKind?: string;
	chapterLabel?: string;
	chapterTitle?: string;
	sectionProgressLabel?: string;
	currentParagraph: string;
	previousParagraphs: string[];
}

function normalizeParagraph(text: string): string {
	return text.trim().replace(/\s+/g, ' ');
}

export function buildReaderContextPrompt(input: ReaderContextPromptInput): string {
	const sourceTitle = input.sourceTitle.trim() || 'this text';
	const sourceKind = input.sourceKind?.trim();
	const chapterLabel = input.chapterLabel?.trim();
	const chapterTitle = input.chapterTitle?.trim();
	const sectionProgressLabel = input.sectionProgressLabel?.trim();
	const previousParagraphs = input.previousParagraphs
		.map(normalizeParagraph)
		.filter((paragraph) => paragraph.length > 0);
	const currentParagraph = normalizeParagraph(input.currentParagraph);
	const metadataLines = [
		sourceKind ? `Source type: ${sourceKind}` : null,
		sourceTitle ? `Title: ${sourceTitle}` : null,
		chapterLabel ? `${chapterLabel}: ${chapterTitle ? `${chapterLabel === 'Chapter' ? '' : ''}${chapterTitle}` : ''}` : null,
		sectionProgressLabel ? `Location: ${sectionProgressLabel}` : null
	].filter((line): line is string => Boolean(line))
		.map((line) => {
			if (line.endsWith(': ')) {
				return line.slice(0, -2);
			}
			return line;
		});
	const normalizedChapterLine =
		chapterLabel && chapterTitle
			? `${chapterLabel}: ${chapterTitle}`
			: chapterLabel
				? chapterLabel
				: null;
	const metadata = [
		sourceKind ? `Source type: ${sourceKind}` : null,
		sourceTitle ? `Title: ${sourceTitle}` : null,
		normalizedChapterLine,
		sectionProgressLabel ? `Location: ${sectionProgressLabel}` : null
	].filter((line): line is string => Boolean(line));

	const contextSections = previousParagraphs.map(
		(paragraph, index) => `Previous paragraph ${index + 1}:\n${paragraph}`
	);
	contextSections.push(`Current paragraph:\n${currentParagraph}`);

	return [
		`I'm reading "${sourceTitle}".`,
		'I want to understand what the author is trying to say in the current paragraph.',
		'Please explain the current paragraph in plain language using the previous paragraphs only as context.',
		'Tell me:',
		'1. What the author is saying here.',
		'2. How it connects to the preceding context.',
		'3. Any assumptions, references, or implications I might miss.',
		'4. A short paraphrase of the current paragraph.',
		'',
		'Reading metadata:',
		metadata.join('\n'),
		'',
		'Context:',
		contextSections.join('\n\n')
	].join('\n');
}
