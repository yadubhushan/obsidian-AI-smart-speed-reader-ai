import { describe, expect, it } from 'vitest';
import {
	classifyPlayingZone,
	computeBandLayout,
	computeBandPad,
	computeMiddleBandRect,
	getScrubHoldDelay,
	getWpmHoldDelay
} from '../src/ui/readerShell/playingGestureBands';

function wordRect(top: number, height: number, left = 0, width = 200): DOMRect {
	return {
		top,
		left,
		width,
		height,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
		toJSON: () => ({})
	};
}

const viewport = { width: 400, height: 800 };

describe('playingGestureBands helpers', () => {
	describe('computeBandPad', () => {
		it('scales with font size and respects minimum', () => {
			expect(computeBandPad(24)).toBe(16);
			expect(computeBandPad(64)).toBe(22);
			expect(computeBandPad(100)).toBe(35);
		});
	});

	describe('computeMiddleBandRect', () => {
		it('expands word rect by pad on top and bottom', () => {
			const pad = 20;
			const rect = wordRect(300, 48);
			const middle = computeMiddleBandRect(rect, pad, viewport);
			expect(middle.top).toBe(280);
			expect(middle.height).toBe(88);
			expect(middle.left).toBe(0);
			expect(middle.width).toBe(400);
		});
	});

	describe('computeBandLayout', () => {
		it('splits middle strip into 30/40/30 columns', () => {
			const layout = computeBandLayout(wordRect(300, 48), 20, viewport);
			expect(layout.middleLeft.width).toBe(120);
			expect(layout.middleCenter.width).toBe(160);
			expect(layout.middleRight.width).toBe(120);
			expect(layout.middleCenter.left).toBe(120);
			expect(layout.middleRight.left).toBe(280);
		});

		it('places top and bottom bands around the middle strip', () => {
			const layout = computeBandLayout(wordRect(300, 48), 20, viewport);
			expect(layout.top.height).toBe(280);
			expect(layout.bottom.top).toBe(368);
			expect(layout.bottom.height).toBe(432);
		});
	});

	describe('classifyPlayingZone', () => {
		const rect = wordRect(300, 48);
		const pad = 20;

		it('classifies top, middle columns, and bottom', () => {
			expect(classifyPlayingZone(200, 100, rect, pad, viewport)).toBe('top');
			expect(classifyPlayingZone(50, 320, rect, pad, viewport)).toBe('middleLeft');
			expect(classifyPlayingZone(200, 320, rect, pad, viewport)).toBe('middleCenter');
			expect(classifyPlayingZone(350, 320, rect, pad, viewport)).toBe('middleRight');
			expect(classifyPlayingZone(200, 500, rect, pad, viewport)).toBe('bottom');
		});

		it('uses 30/70 lateral boundaries on full viewport width', () => {
			expect(classifyPlayingZone(119, 320, rect, pad, viewport)).toBe('middleLeft');
			expect(classifyPlayingZone(120, 320, rect, pad, viewport)).toBe('middleCenter');
			expect(classifyPlayingZone(279, 320, rect, pad, viewport)).toBe('middleCenter');
			expect(classifyPlayingZone(281, 320, rect, pad, viewport)).toBe('middleRight');
		});
	});

	describe('hold delay helpers', () => {
		it('accelerates WPM hold after five ticks', () => {
			expect(getWpmHoldDelay(1)).toBe(250);
			expect(getWpmHoldDelay(4)).toBe(250);
			expect(getWpmHoldDelay(5)).toBe(120);
		});

		it('accelerates scrub hold like edge scrub', () => {
			expect(getScrubHoldDelay(1)).toBe(150);
			expect(getScrubHoldDelay(3)).toBe(100);
			expect(getScrubHoldDelay(6)).toBe(50);
		});
	});
});
