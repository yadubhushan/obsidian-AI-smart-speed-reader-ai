import type { WordData } from '../../../../types';
import type { FocusStrategyId } from '../../../../types';

/** DOM-agnostic segment for focus block rendering and tests. */
export type FocusBlockSegmentKind =
	| 'plain'
	| 'orp-before'
	| 'orp-char'
	| 'orp-after'
	| 'orp-dim-before'
	| 'orp-dim-char'
	| 'orp-dim-after'
	| 'orp-focus-before'
	| 'orp-focus-char'
	| 'orp-focus-after'
	| 'anchor'
	| 'muted'
	| 'faded'
	| 'forward-lead'
	| 'gradient-accent'
	| 'para-weak'
	| 'para-core'
	| 'para-mid'
	| 'crowding-edge'
	| 'crowding-core';

export interface FocusBlockSegment {
	text: string;
	kind: FocusBlockSegmentKind;
}

export interface FocusBlockInput {
	words: WordData[];
	chunkSize: number;
	focusStrategy: FocusStrategyId;
	orpColor?: string;
}

export interface FocusBlockOutput {
	segments: FocusBlockSegment[];
	isLive: boolean;
}

export interface FocusStrategyDefinition {
	id: FocusStrategyId;
	name: string;
	description: string;
	isLive: boolean;
	buildBlock(input: FocusBlockInput): FocusBlockOutput;
}

export const FOCUS_STRATEGY_LABELS: Record<FocusStrategyId, { name: string; description: string }> = {
	orp: {
		name: 'ORP Highlight',
		description: 'Highlights the Optimal Recognition Point of each word using proven RSVP positioning.'
	},
	'peach-anchor': {
		name: 'Foveal Peach Anchor',
		description:
			'Leading words in white; final anchor word highlighted in a soft pastel peach to reduce visual fatigue.'
	},
	'forward-pull': {
		name: 'Forward Pull',
		description: 'Accents the final word in the block using theme gradients to pull attention left-to-right.'
	},
	parafoveal: {
		name: 'Parafoveal Preview',
		description: 'Simulates foveal vision dropoff with graduated contrast across the chunk.'
	},
	'multi-orp': {
		name: 'Multi-ORP Sync',
		description: 'Highlights the ORP of every word in the block simultaneously.'
	},
	'crowding-shield': {
		name: 'Crowding Shield',
		description: 'Fades flanking words to reduce spatial crowding around the foveal target.'
	}
};
