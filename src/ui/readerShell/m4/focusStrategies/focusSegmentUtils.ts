import { splitWordForOrpDisplay } from '../../../../services/textParser';
import type { FocusBlockOutput, FocusBlockSegment } from './focusStrategyTypes';

export function wordDisplayText(word: { word: string; punctuation: string }): string {
	return `${word.word}${word.punctuation}`;
}

export function pushWordGap(segments: FocusBlockSegment[], index: number): void {
	if (index > 0) {
		segments.push({ text: ' ', kind: 'plain' });
	}
}

export function liveOutput(segments: FocusBlockSegment[]): FocusBlockOutput {
	return { segments, isLive: true };
}

export type OrpEmphasis = 'standard' | 'dim' | 'focus';

const ORP_KIND: Record<OrpEmphasis, [FocusBlockSegment['kind'], FocusBlockSegment['kind'], FocusBlockSegment['kind']]> = {
	standard: ['orp-before', 'orp-char', 'orp-after'],
	dim: ['orp-dim-before', 'orp-dim-char', 'orp-dim-after'],
	focus: ['orp-focus-before', 'orp-focus-char', 'orp-focus-after']
};

export function orpSegmentsForWord(
	word: { word: string; punctuation: string; orpIndex: number },
	emphasis: OrpEmphasis = 'standard'
): FocusBlockSegment[] {
	const { before, orp, after } = splitWordForOrpDisplay(word.word, word.orpIndex);
	const [beforeKind, orpKind, afterKind] = ORP_KIND[emphasis];
	return [
		{ text: before, kind: beforeKind },
		{ text: orp, kind: orpKind },
		{ text: `${after}${word.punctuation}`, kind: afterKind }
	];
}
