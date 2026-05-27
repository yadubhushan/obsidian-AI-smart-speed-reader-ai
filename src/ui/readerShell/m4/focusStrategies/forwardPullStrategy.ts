import type { FocusBlockInput, FocusBlockOutput, FocusBlockSegment } from './focusStrategyTypes';
import { liveOutput, pushWordGap, wordDisplayText } from './focusSegmentUtils';

type ForwardRole = 'forward-lead' | 'gradient-accent';

function forwardRoleForIndex(index: number, wordCount: number): ForwardRole {
	if (wordCount <= 1) {
		return 'gradient-accent';
	}
	return index === wordCount - 1 ? 'gradient-accent' : 'forward-lead';
}

/** Accents the final word with theme gradient; leading words stay muted. */
export function buildForwardPullFocusBlock(input: FocusBlockInput): FocusBlockOutput {
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
			kind: forwardRoleForIndex(i, words.length)
		});
	}
	return liveOutput(segments);
}
