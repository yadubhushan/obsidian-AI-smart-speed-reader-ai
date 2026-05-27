import type { FocusBlockInput, FocusBlockOutput, FocusBlockSegment } from './focusStrategyTypes';
import { liveOutput, pushWordGap, wordDisplayText } from './focusSegmentUtils';

type CrowdingRole = 'crowding-edge' | 'crowding-core';

function crowdingRoleForIndex(index: number, wordCount: number): CrowdingRole {
	if (wordCount <= 1) {
		return 'crowding-core';
	}
	if (wordCount === 2) {
		return index === 0 ? 'crowding-core' : 'crowding-edge';
	}
	return index === 1 ? 'crowding-core' : 'crowding-edge';
}

/** Foveal center at full contrast; flanking words at 15% opacity. */
export function buildCrowdingShieldFocusBlock(input: FocusBlockInput): FocusBlockOutput {
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
			kind: crowdingRoleForIndex(i, words.length)
		});
	}
	return liveOutput(segments);
}
