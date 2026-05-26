import { navWordsFromStream, wordIndexForSeekIndex } from '../engine/readingNavigation';
import type { RSVPEngine } from '../engine/rsvpEngine';
import type { ReaderState } from '../types';
import type {
	BookCacheIndex,
	BookPosition,
	NotePosition,
	ReadingStatus,
	SourceKind
} from '../types/m2Contracts';
import type { ProcessedDocument } from '../types/processedDocument';

function isSectionsProcessed(
	processed: ProcessedDocument
): processed is Extract<ProcessedDocument, { kind: 'sections' }> {
	return processed.kind === 'sections';
}

function isStoryProcessed(
	processed: ProcessedDocument
): processed is Extract<ProcessedDocument, { kind: 'single_story' }> {
	return processed.kind === 'single_story';
}

export const FINISHED_PROGRESS_THRESHOLD = 95;

export function clampProgressPercent(value: number): number {
	return Math.max(0, Math.min(100, value));
}

export function statusFromProgressPercent(progressPercent: number): ReadingStatus {
	return progressPercent >= FINISHED_PROGRESS_THRESHOLD ? 'finished' : 'in_progress';
}

export function bookProgressPercent(index: BookCacheIndex, position: BookPosition): number {
	if (index.totalWordCount <= 0) {
		return 0;
	}

	const chapterIndex = index.chapters.findIndex((c) => c.chapterId === position.chapterId);
	if (chapterIndex < 0) {
		return 0;
	}

	let wordsConsumed = 0;
	for (let i = 0; i < chapterIndex; i++) {
		wordsConsumed += index.chapters[i]?.wordCount ?? 0;
	}
	wordsConsumed += Math.max(0, Math.min(position.wordIndex, index.chapters[chapterIndex]?.wordCount ?? 0));

	return clampProgressPercent((wordsConsumed / index.totalWordCount) * 100);
}

export function countWordTokensInStream(stream: Array<{ kind: string }>): number {
	return stream.filter((token) => token.kind === 'word').length;
}

export function noteProgressPercent(
	processed: ProcessedDocument,
	position: NotePosition
): number {
	if (isStoryProcessed(processed)) {
		const totalWords = countWordTokensInStream(processed.stream);
		if (totalWords <= 0) {
			return 0;
		}
		return clampProgressPercent((position.wordIndex / totalWords) * 100);
	}

	if (!isSectionsProcessed(processed)) {
		return 0;
	}

	const sections = processed.sections;
	const totalWords = sections.reduce(
		(sum, section) => sum + countWordTokensInStream(section.stream),
		0
	);
	if (totalWords <= 0) {
		return 0;
	}

	const sectionIndex = sections.findIndex((s) => s.sectionId === position.sectionId);
	if (sectionIndex < 0) {
		return 0;
	}

	let wordsConsumed = 0;
	for (let i = 0; i < sectionIndex; i++) {
		wordsConsumed += countWordTokensInStream(sections[i]!.stream);
	}

	const activeSection = sections[sectionIndex]!;
	const sectionWordCount = countWordTokensInStream(activeSection.stream);
	wordsConsumed += Math.max(0, Math.min(position.wordIndex, sectionWordCount));

	return clampProgressPercent((wordsConsumed / totalWords) * 100);
}

export function bookPositionFromEngine(
	index: BookCacheIndex,
	sectionId: string | undefined,
	wordIndex: number
): BookPosition {
	const chapterId =
		sectionId && index.chapters.some((c) => c.chapterId === sectionId)
			? sectionId
			: (index.chapters[0]?.chapterId ?? 'chapter-01');

	const chapter = index.chapters.find((c) => c.chapterId === chapterId);
	const maxIndex = Math.max((chapter?.wordCount ?? 1) - 1, 0);

	return {
		chapterId,
		wordIndex: Math.max(0, Math.min(wordIndex, maxIndex))
	};
}

export function notePositionFromEngine(
	processed: ProcessedDocument,
	sectionId: string | undefined,
	tokenIndex: number
): NotePosition {
	if (isStoryProcessed(processed)) {
		const navWords = navWordsFromStream(processed.stream);
		return {
			sectionId: 'single_story',
			wordIndex: Math.max(0, wordIndexForSeekIndex(navWords, tokenIndex))
		};
	}

	if (!isSectionsProcessed(processed) || processed.sections.length === 0) {
		return { sectionId: 'section-01', wordIndex: 0 };
	}

	const resolvedSectionId =
		sectionId && processed.sections.some((s) => s.sectionId === sectionId)
			? sectionId
			: processed.sections[0]!.sectionId;

	const section = processed.sections.find((s) => s.sectionId === resolvedSectionId)!;
	const navWords = navWordsFromStream(section.stream);
	const wordIndex = wordIndexForSeekIndex(navWords, tokenIndex);

	return {
		sectionId: resolvedSectionId,
		wordIndex: Math.max(0, wordIndex)
	};
}

export function notePositionToEngineIndices(
	processed: ProcessedDocument,
	position?: NotePosition
): { sectionIndex: number; tokenIndex: number } {
	if (isStoryProcessed(processed)) {
		if (!position) {
			return { sectionIndex: 0, tokenIndex: 0 };
		}
		const navWords = navWordsFromStream(processed.stream);
		let tokenIndex = 0;
		for (const navWord of navWords) {
			if (navWord.wordIndex >= position.wordIndex) {
				tokenIndex = navWord.seekIndex;
				break;
			}
			tokenIndex = navWord.seekIndex;
		}
		return { sectionIndex: 0, tokenIndex };
	}

	if (!isSectionsProcessed(processed) || processed.sections.length === 0) {
		return { sectionIndex: 0, tokenIndex: 0 };
	}

	if (!position) {
		return { sectionIndex: 0, tokenIndex: 0 };
	}

	const sectionIndex = processed.sections.findIndex((s) => s.sectionId === position.sectionId);
	if (sectionIndex < 0) {
		return { sectionIndex: 0, tokenIndex: 0 };
	}

	const section = processed.sections[sectionIndex]!;
	const navWords = navWordsFromStream(section.stream);
	let tokenIndex = 0;
	for (const navWord of navWords) {
		if (navWord.wordIndex >= position.wordIndex) {
			tokenIndex = navWord.seekIndex;
			break;
		}
		tokenIndex = navWord.seekIndex;
	}

	return { sectionIndex, tokenIndex };
}

export function defaultNotePosition(processed: ProcessedDocument): NotePosition {
	if (!isSectionsProcessed(processed) || processed.sections.length === 0) {
		return { sectionId: 'section-01', wordIndex: 0 };
	}
	return { sectionId: processed.sections[0]!.sectionId, wordIndex: 0 };
}

export function notePositionFromReadingState(
	processed: ProcessedDocument,
	position: NotePosition | undefined
): NotePosition {
	if (!position || !('sectionId' in position)) {
		return defaultNotePosition(processed);
	}

	if (position.sectionId === 'single_story') {
		if (isStoryProcessed(processed)) {
			const totalWords = countWordTokensInStream(processed.stream);
			const maxIndex = Math.max(totalWords - 1, 0);
			return {
				sectionId: 'single_story',
				wordIndex: Math.max(0, Math.min(position.wordIndex, maxIndex))
			};
		}
		return defaultNotePosition(processed);
	}

	if (isStoryProcessed(processed)) {
		return { sectionId: 'single_story', wordIndex: 0 };
	}

	if (isSectionsProcessed(processed)) {
		const exists = processed.sections.some((s) => s.sectionId === position.sectionId);
		return exists ? position : defaultNotePosition(processed);
	}

	return defaultNotePosition(processed);
}

export function applyNoteResumePosition(
	engine: RSVPEngine,
	processed: ProcessedDocument,
	position: NotePosition
): void {
	const resolved = notePositionFromReadingState(processed, position);
	const { sectionIndex, tokenIndex } = notePositionToEngineIndices(processed, resolved);
	engine.goToSection(sectionIndex);
	engine.seekToToken(tokenIndex);
}

export function parentFolderFromPath(sourcePath: string): string {
	const normalized = sourcePath.replace(/\\/g, '/');
	const lastSlash = normalized.lastIndexOf('/');
	return lastSlash >= 0 ? normalized.slice(0, lastSlash) : '';
}

export function basenameFromPath(sourcePath: string): string {
	const normalized = sourcePath.replace(/\\/g, '/');
	const lastSlash = normalized.lastIndexOf('/');
	return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

export function shouldResetReadingState(
	storedChecksum: string | undefined,
	currentChecksum: string
): boolean {
	return Boolean(storedChecksum && storedChecksum !== currentChecksum);
}

export interface ProgressInput {
	sourceKind: SourceKind;
	bookIndex?: BookCacheIndex;
	processed?: ProcessedDocument;
	position: BookPosition | NotePosition;
}

export function computeProgressPercent(input: ProgressInput): number {
	if (input.sourceKind === 'book' && input.bookIndex && 'chapterId' in input.position) {
		return bookProgressPercent(input.bookIndex, input.position);
	}
	if (input.sourceKind === 'note' && input.processed && 'sectionId' in input.position) {
		return noteProgressPercent(input.processed, input.position);
	}
	return 0;
}

export interface DocumentProgressInput {
	sourceKind: SourceKind;
	bookIndex?: BookCacheIndex;
	engine: Pick<RSVPEngine, 'getLoadedProcessedDocument' | 'getSectionList'>;
	state: ReaderState;
}

/** Progress through the full note or book (all sections/chapters), not the current section only. */
export function computeDocumentProgressFromEngine(input: DocumentProgressInput): number {
	const { engine, state, sourceKind, bookIndex } = input;
	const processed = engine.getLoadedProcessedDocument();
	if (!processed) {
		const total = state.totalTokens ?? state.totalWords ?? 0;
		const current = state.currentTokenIndex ?? state.currentIndex ?? 0;
		if (total <= 0) {
			return 0;
		}
		return clampProgressPercent((current / total) * 100);
	}

	const sections = engine.getSectionList();
	const sectionId =
		sections.length > 0 ? sections[state.currentSectionIndex ?? 0]?.id : undefined;
	const tokenIndex = state.currentTokenIndex ?? state.currentIndex;

	let position: BookPosition | NotePosition;
	if (sourceKind === 'book' && bookIndex) {
		const navWords =
			processed.kind === 'sections'
				? navWordsFromStream(processed.sections[state.currentSectionIndex ?? 0]?.stream ?? [])
				: [];
		const wordIndex =
			navWords.length > 0 ? wordIndexForSeekIndex(navWords, tokenIndex) : tokenIndex;
		position = bookPositionFromEngine(bookIndex, sectionId, wordIndex);
	} else {
		position = notePositionFromEngine(processed, sectionId, tokenIndex);
	}

	return computeProgressPercent({
		sourceKind,
		bookIndex,
		processed,
		position
	});
}
