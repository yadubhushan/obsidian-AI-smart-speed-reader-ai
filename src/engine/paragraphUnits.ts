import type { SentenceUnit } from './lineRepeatPlayback';
import type { NavWord } from './readingNavigation';

export interface ParagraphUnit {
	startWordIdx: number;
	endWordIdx: number;
}

const FALLBACK_MAX_SENTENCES = 6;
const FALLBACK_MAX_CHARS = 600;

export function hasParagraphMarkers(navWords: NavWord[]): boolean {
	return navWords.some((w, i) => i > 0 && w.isParagraphStart);
}

export function buildParagraphUnits(
	navWords: NavWord[],
	sentenceUnits: SentenceUnit[]
): ParagraphUnit[] {
	if (navWords.length === 0) {
		return [];
	}

	if (hasParagraphMarkers(navWords)) {
		return buildParagraphUnitsFromMarkers(navWords);
	}

	return buildParagraphUnitsFallback(navWords, sentenceUnits);
}

function buildParagraphUnitsFromMarkers(navWords: NavWord[]): ParagraphUnit[] {
	const units: ParagraphUnit[] = [];
	let start = 0;

	for (let i = 1; i < navWords.length; i++) {
		if (navWords[i]!.isParagraphStart) {
			units.push({ startWordIdx: start, endWordIdx: i - 1 });
			start = i;
		}
	}

	units.push({ startWordIdx: start, endWordIdx: navWords.length - 1 });
	return units;
}

function buildParagraphUnitsFallback(
	navWords: NavWord[],
	sentenceUnits: SentenceUnit[]
): ParagraphUnit[] {
	if (sentenceUnits.length === 0) {
		return [{ startWordIdx: 0, endWordIdx: navWords.length - 1 }];
	}

	const units: ParagraphUnit[] = [];
	let groupStart = 0;
	let sentenceCount = 0;
	let charCount = 0;

	for (let i = 0; i < sentenceUnits.length; i++) {
		const unit = sentenceUnits[i]!;
		const sentenceText = navWords
			.slice(unit.startWordIdx, unit.endWordIdx + 1)
			.map((w) => w.display)
			.join(' ');
		const nextSentenceCount = sentenceCount + 1;
		const nextCharCount = charCount + sentenceText.length + (charCount > 0 ? 1 : 0);

		const wouldExceed =
			sentenceCount > 0 &&
			(nextSentenceCount > FALLBACK_MAX_SENTENCES || nextCharCount > FALLBACK_MAX_CHARS);

		if (wouldExceed) {
			const prev = sentenceUnits[i - 1]!;
			units.push({ startWordIdx: groupStart, endWordIdx: prev.endWordIdx });
			groupStart = unit.startWordIdx;
			sentenceCount = 1;
			charCount = sentenceText.length;
		} else {
			sentenceCount = nextSentenceCount;
			charCount = nextCharCount;
		}
	}

	const last = sentenceUnits[sentenceUnits.length - 1]!;
	units.push({ startWordIdx: groupStart, endWordIdx: last.endWordIdx });
	return units;
}

export function findParagraphForWordIndex(
	units: ParagraphUnit[],
	wordIdx: number
): ParagraphUnit | null {
	if (units.length === 0) {
		return null;
	}

	for (const unit of units) {
		if (wordIdx >= unit.startWordIdx && wordIdx <= unit.endWordIdx) {
			return unit;
		}
	}

	if (wordIdx < units[0]!.startWordIdx) {
		return units[0]!;
	}

	return units[units.length - 1]!;
}

export function paragraphTextFromUnit(navWords: NavWord[], unit: ParagraphUnit): string {
	return navWords
		.slice(unit.startWordIdx, unit.endWordIdx + 1)
		.map((w) => w.display)
		.join(' ')
		.trim();
}
