import type { FocusBlockInput, FocusBlockOutput } from './focusStrategyTypes';
import { liveOutput, pushWordGap, wordDisplayText } from './focusSegmentUtils';

/** Leading words in white; final anchor word highlighted in theme ORP color. */
export function buildPeachAnchorFocusBlock(input: FocusBlockInput): FocusBlockOutput {
	const segments: FocusBlockOutput['segments'] = [];
	const words = input.words;
	if (words.length === 0) {
		return liveOutput(segments);
	}

	if (input.chunkSize === 1 && words[0]) {
		segments.push({ text: wordDisplayText(words[0]), kind: 'anchor' });
		return liveOutput(segments);
	}

	for (let i = 0; i < words.length; i++) {
		const w = words[i]!;
		pushWordGap(segments, i);
		const isAnchor = i === words.length - 1;
		segments.push({ text: wordDisplayText(w), kind: isAnchor ? 'anchor' : 'plain' });
	}
	return liveOutput(segments);
}
