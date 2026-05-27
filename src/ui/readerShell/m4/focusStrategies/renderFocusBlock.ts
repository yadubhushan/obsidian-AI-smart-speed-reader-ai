import type { FocusBlockSegment, FocusBlockSegmentKind } from './focusStrategyTypes';

const SEGMENT_CLASS: Record<FocusBlockSegmentKind, string> = {
	plain: 'speed-reader-m4-focus-plain',
	'orp-before': 'speed-reader-m4-focus-orp-before',
	'orp-char': 'speed-reader-m4-focus-orp-char',
	'orp-after': 'speed-reader-m4-focus-orp-after',
	'orp-dim-before': 'speed-reader-m4-focus-orp-dim-before',
	'orp-dim-char': 'speed-reader-m4-focus-orp-dim-char',
	'orp-dim-after': 'speed-reader-m4-focus-orp-dim-after',
	'orp-focus-before': 'speed-reader-m4-focus-orp-focus-before',
	'orp-focus-char': 'speed-reader-m4-focus-orp-focus-char',
	'orp-focus-after': 'speed-reader-m4-focus-orp-focus-after',
	anchor: 'speed-reader-m4-focus-anchor',
	muted: 'speed-reader-m4-focus-muted',
	faded: 'speed-reader-m4-focus-faded',
	'forward-lead': 'speed-reader-m4-focus-forward-lead',
	'gradient-accent': 'speed-reader-m4-focus-gradient-accent',
	'para-weak': 'speed-reader-m4-focus-para-weak',
	'para-core': 'speed-reader-m4-focus-para-core',
	'para-mid': 'speed-reader-m4-focus-para-mid',
	'crowding-edge': 'speed-reader-m4-focus-crowding-edge',
	'crowding-core': 'speed-reader-m4-focus-crowding-core'
};

export function appendFocusBlockToElement(parent: HTMLElement, segments: FocusBlockSegment[]): void {
	for (const segment of segments) {
		if (segment.text.length === 0) {
			continue;
		}
		parent.createSpan({
			cls: SEGMENT_CLASS[segment.kind],
			text: segment.text
		});
	}
}

export function renderOrpLayoutToElement(
	parent: HTMLElement,
	parts: { before: string; orp: string; after: string }
): void {
	appendFocusBlockToElement(parent, [
		{ text: parts.before, kind: 'orp-before' },
		{ text: parts.orp, kind: 'orp-char' },
		{ text: parts.after, kind: 'orp-after' }
	]);
}
