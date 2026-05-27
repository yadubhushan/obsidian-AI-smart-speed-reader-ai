import type { FocusBlockInput, FocusBlockOutput } from './focusStrategyTypes';
import { liveOutput, orpSegmentsForWord, pushWordGap, wordDisplayText } from './focusSegmentUtils';

export { orpSegmentsForWord } from './focusSegmentUtils';

export function buildOrpFocusBlock(input: FocusBlockInput): FocusBlockOutput {
	const segments: FocusBlockOutput['segments'] = [];
	if (input.chunkSize === 1 && input.words[0]) {
		segments.push(...orpSegmentsForWord(input.words[0]));
		return liveOutput(segments);
	}

	for (let i = 0; i < input.words.length; i++) {
		const w = input.words[i]!;
		pushWordGap(segments, i);
		if (input.chunkSize === 1) {
			segments.push(...orpSegmentsForWord(w));
		} else {
			segments.push({
				text: wordDisplayText(w),
				kind: i === input.words.length - 1 ? 'anchor' : 'plain'
			});
		}
	}
	return liveOutput(segments);
}

export function buildOrpSingleWordBlock(word: {
	word: string;
	punctuation: string;
	orpIndex: number;
}): FocusBlockOutput {
	return {
		segments: orpSegmentsForWord(word),
		isLive: true
	};
}
