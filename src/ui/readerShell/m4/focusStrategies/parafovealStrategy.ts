import type { FocusBlockInput, FocusBlockOutput, FocusBlockSegment } from './focusStrategyTypes';
import { liveOutput, pushWordGap, wordDisplayText } from './focusSegmentUtils';

type ParafovealRole = 'para-weak' | 'para-core' | 'para-mid';

function parafovealRoleForIndex(index: number, wordCount: number): ParafovealRole {
	if (wordCount <= 1) {
		return 'para-core';
	}
	if (wordCount === 2) {
		return index === 0 ? 'para-core' : 'para-mid';
	}
	if (index === 0) {
		return 'para-weak';
	}
	if (index === 1) {
		return 'para-core';
	}
	return 'para-mid';
}

/** Graduated contrast: 30% left, 100% center, 65% right in 3w chunks. */
export function buildParafovealFocusBlock(input: FocusBlockInput): FocusBlockOutput {
	const segments: FocusBlockSegment[] = [];
	const words = input.words;
	if (words.length === 0) {
		return liveOutput(segments);
	}

	for (let i = 0; i < words.length; i++) {
		const w = words[i]!;
		pushWordGap(segments, i);
		segments.push({
			text: wordDisplayText(w),
			kind: parafovealRoleForIndex(i, words.length)
		});
	}
	return liveOutput(segments);
}
