import type { NavWord } from './readingNavigation';

export interface SentenceUnit {
	lineIndex: number;
	startWordIdx: number;
	endWordIdx: number;
	startSeekIndex: number;
	endSeekIndex: number;
}

export interface LineBoundary {
	isStart: boolean;
	isEnd: boolean;
}

export type LineRepeatAdvanceResult =
	| { action: 'loop'; nextSeekIndex: number; extraDelayMs: number }
	| { action: 'advance'; nextSeekIndex: number }
	| { action: 'complete' };

export function buildSentenceUnits(navWords: NavWord[]): SentenceUnit[] {
	if (navWords.length === 0) {
		return [];
	}

	const units: SentenceUnit[] = [];
	let start = 0;

	for (let i = 0; i < navWords.length; i++) {
		const word = navWords[i]!;
		if (word.isSentenceEnd || i === navWords.length - 1) {
			const startWord = navWords[start]!;
			units.push({
				lineIndex: units.length,
				startWordIdx: start,
				endWordIdx: i,
				startSeekIndex: startWord.seekIndex,
				endSeekIndex: word.seekIndex
			});
			start = i + 1;
		}
	}

	return units;
}

export function findSentenceUnitForSeekIndex(
	units: SentenceUnit[],
	seekIndex: number
): number {
	if (units.length === 0) {
		return 0;
	}

	for (let i = 0; i < units.length; i++) {
		const unit = units[i]!;
		if (seekIndex >= unit.startSeekIndex && seekIndex <= unit.endSeekIndex) {
			return i;
		}
	}

	if (seekIndex < units[0]!.startSeekIndex) {
		return 0;
	}

	return units.length - 1;
}

export function getLineBoundary(
	units: SentenceUnit[],
	unitIndex: number,
	currentSeekIndex: number
): LineBoundary {
	const unit = units[unitIndex];
	if (!unit) {
		return { isStart: false, isEnd: false };
	}

	return {
		isStart: currentSeekIndex === unit.startSeekIndex,
		isEnd: currentSeekIndex === unit.endSeekIndex
	};
}

export function computeLineRepeatAdvance(
	units: SentenceUnit[],
	currentSeekIndex: number,
	nextSeekIndex: number,
	lineRepeatGapMs: number,
	isManifest: boolean,
	streamLength?: number
): LineRepeatAdvanceResult {
	if (units.length === 0) {
		return { action: 'complete' };
	}

	const unitIndex = findSentenceUnitForSeekIndex(units, currentSeekIndex);
	const unit = units[unitIndex]!;

	if (nextSeekIndex > unit.endSeekIndex) {
		return {
			action: 'loop',
			nextSeekIndex: unit.startSeekIndex,
			extraDelayMs: lineRepeatGapMs
		};
	}

	if (isManifest && streamLength !== undefined && nextSeekIndex >= streamLength) {
		return { action: 'complete' };
	}

	return { action: 'advance', nextSeekIndex };
}

export function nextLineUnitIndex(units: SentenceUnit[], currentUnitIndex: number): number {
	if (units.length === 0) {
		return 0;
	}
	return Math.min(currentUnitIndex + 1, units.length - 1);
}

export function prevLineUnitIndex(units: SentenceUnit[], currentUnitIndex: number): number {
	if (units.length === 0) {
		return 0;
	}
	return Math.max(currentUnitIndex - 1, 0);
}
