import type { FocusBlockInput, FocusBlockOutput, FocusBlockSegment } from './focusStrategyTypes';
import { liveOutput, orpSegmentsForWord, pushWordGap, type OrpEmphasis } from './focusSegmentUtils';

function orpEmphasisForIndex(index: number, wordCount: number): OrpEmphasis {
	return index === wordCount - 1 ? 'focus' : 'dim';
}

/** Highlights the ORP of every word; final word in chunk receives strongest emphasis. */
export function buildMultiOrpFocusBlock(input: FocusBlockInput): FocusBlockOutput {
	const segments: FocusBlockSegment[] = [];
	const words = input.words;
	if (words.length === 0) {
		return liveOutput(segments);
	}

	for (let i = 0; i < words.length; i++) {
		const w = words[i]!;
		pushWordGap(segments, i);
		segments.push(...orpSegmentsForWord(w, orpEmphasisForIndex(i, words.length)));
	}
	return liveOutput(segments);
}
