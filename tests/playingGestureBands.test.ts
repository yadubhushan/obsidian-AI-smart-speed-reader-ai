import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	classifyPlayingZone,
	computeBandLayout,
	computeBandPad,
	computeMiddleBandRect,
	createTopBannerController,
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
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

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
		it('gives scrub columns full viewport height and 30% width', () => {
			const layout = computeBandLayout(wordRect(300, 48), 20, viewport);
			expect(layout.scrubLeft).toEqual({ top: 0, left: 0, width: 120, height: 800 });
			expect(layout.scrubRight).toEqual({ top: 0, left: 280, width: 120, height: 800 });
		});

		it('narrows WPM and play/pause zones to center 40% column', () => {
			const layout = computeBandLayout(wordRect(300, 48), 20, viewport);
			expect(layout.centerTop).toEqual({ top: 0, left: 120, width: 160, height: 280 });
			expect(layout.centerMiddle).toEqual({ top: 280, left: 120, width: 160, height: 88 });
			expect(layout.centerBottom).toEqual({ top: 368, left: 120, width: 160, height: 432 });
		});
	});

	describe('classifyPlayingZone', () => {
		const rect = wordRect(300, 48);
		const pad = 20;

		it('classifies left and right scrub at any vertical position', () => {
			expect(classifyPlayingZone(50, 100, rect, pad, viewport)).toBe('middleLeft');
			expect(classifyPlayingZone(50, 320, rect, pad, viewport)).toBe('middleLeft');
			expect(classifyPlayingZone(350, 100, rect, pad, viewport)).toBe('middleRight');
			expect(classifyPlayingZone(350, 500, rect, pad, viewport)).toBe('middleRight');
		});

		it('classifies center column by vertical band', () => {
			expect(classifyPlayingZone(200, 100, rect, pad, viewport)).toBe('top');
			expect(classifyPlayingZone(200, 320, rect, pad, viewport)).toBe('middleCenter');
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
	});

	describe('top banner controller', () => {
		it('queues milestone messages until the current WPM banner hides', () => {
			const visible: Array<string | null> = [];
			const controller = createTopBannerController({
				render: (message) => visible.push(message?.text ?? null),
				scheduleHide: (callback, delayMs) => setTimeout(callback, delayMs),
				clearHide: (timer) => clearTimeout(timer)
			});

			controller.showSpeedLabel(250);
			controller.showMessage('Nice. You have read continuously for 5 min.', 'milestone');

			expect(visible).toEqual(['250 WPM']);

			vi.advanceTimersByTime(2000);
			expect(visible).toEqual([
				'250 WPM',
				null,
				'Nice. You have read continuously for 5 min.'
			]);
		});

		it('updates WPM immediately while keeping the shared banner path', () => {
			const visible: Array<string | null> = [];
			const controller = createTopBannerController({
				render: (message) => visible.push(message?.text ?? null),
				scheduleHide: (callback, delayMs) => setTimeout(callback, delayMs),
				clearHide: (timer) => clearTimeout(timer)
			});

			controller.showMessage('Nice. You have read continuously for 5 min.', 'milestone');
			controller.showSpeedLabel(200);
			controller.showSpeedLabel(205);

			expect(visible).toEqual([
				'Nice. You have read continuously for 5 min.',
				'200 WPM',
				'205 WPM'
			]);
		});
	});
});
