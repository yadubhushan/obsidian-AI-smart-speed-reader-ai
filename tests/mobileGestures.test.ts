import { describe, expect, it } from 'vitest';
import {
	classifyLateralZone,
	exceedsTapMovement,
	isDoubleTap,
	isEdgeZone,
	isSwipeDown,
	isSwipeUp,
	isSwipeBack,
	shouldSuppressContextWordRetap,
	EDGE_ZONE_RATIO
} from '../src/ui/readerShell/mobileGestures';
import { shouldIgnoreBackdropDismiss } from '../src/ui/readerShell/mobileDictionarySheet';

function rect(left: number, width: number): DOMRect {
	return { left, width, top: 0, height: 100, right: left + width, bottom: 100, x: left, y: 0, toJSON: () => ({}) };
}

describe('mobileGestures helpers', () => {
	describe('classifyLateralZone', () => {
		it('classifies left, center, and right zones', () => {
			const r = rect(0, 100);
			expect(classifyLateralZone(15, r)).toBe('left');
			expect(classifyLateralZone(50, r)).toBe('center');
			expect(classifyLateralZone(85, r)).toBe('right');
		});

		it('returns center for zero-width rect', () => {
			expect(classifyLateralZone(50, rect(0, 0))).toBe('center');
		});

		it('respects 30/70 boundaries', () => {
			const r = rect(100, 200);
			expect(classifyLateralZone(159, r)).toBe('left');
			expect(classifyLateralZone(160, r)).toBe('center');
			expect(classifyLateralZone(239, r)).toBe('center');
			expect(classifyLateralZone(241, r)).toBe('right');
		});
	});

	describe('isEdgeZone', () => {
		it('detects outer 8% left and right edges', () => {
			const r = rect(0, 100);
			expect(isEdgeZone(5, r)).toBe('left');
			expect(isEdgeZone(8, r, EDGE_ZONE_RATIO)).toBe('left');
			expect(isEdgeZone(50, r)).toBe(null);
			expect(isEdgeZone(92, r)).toBe('right');
			expect(isEdgeZone(95, r)).toBe('right');
		});

		it('returns null for zero-width rect', () => {
			expect(isEdgeZone(50, rect(0, 0))).toBe(null);
		});
	});

	describe('shouldSuppressContextWordRetap', () => {
		it('suppresses second tap on same word within window', () => {
			const now = 1000;
			expect(shouldSuppressContextWordRetap('hello', 800, 'hello', now)).toBe(true);
		});

		it('allows tap on different word', () => {
			const now = 1000;
			expect(shouldSuppressContextWordRetap('hello', 800, 'world', now)).toBe(false);
		});

		it('allows tap outside the window', () => {
			const now = 1000;
			expect(shouldSuppressContextWordRetap('hello', 600, 'hello', now)).toBe(false);
		});

		it('allows first tap when no prior tap', () => {
			expect(shouldSuppressContextWordRetap(null, 0, 'hello', 1000)).toBe(false);
		});
	});

	describe('shouldIgnoreBackdropDismiss', () => {
		it('ignores dismiss within grace period after open', () => {
			const openedAt = 1000;
			expect(shouldIgnoreBackdropDismiss(openedAt, 1200)).toBe(true);
			expect(shouldIgnoreBackdropDismiss(openedAt, 1349)).toBe(true);
		});

		it('allows dismiss after grace period', () => {
			const openedAt = 1000;
			expect(shouldIgnoreBackdropDismiss(openedAt, 1350)).toBe(false);
			expect(shouldIgnoreBackdropDismiss(openedAt, 2000)).toBe(false);
		});

		it('allows dismiss when sheet was never opened', () => {
			expect(shouldIgnoreBackdropDismiss(0, 1000)).toBe(false);
		});
	});

	describe('isDoubleTap', () => {
		it('detects second tap in same lateral zone within window', () => {
			const now = 1000;
			expect(isDoubleTap('left', 800, 'left', now)).toBe(true);
			expect(isDoubleTap('right', 750, 'right', now)).toBe(true);
		});

		it('rejects different zones or center', () => {
			const now = 1000;
			expect(isDoubleTap('left', 800, 'right', now)).toBe(false);
			expect(isDoubleTap('left', 800, 'center', now)).toBe(false);
			expect(isDoubleTap('center', 800, 'center', now)).toBe(false);
		});

		it('rejects taps outside the window', () => {
			const now = 1000;
			expect(isDoubleTap('left', 600, 'left', now)).toBe(false);
		});

		it('rejects when no prior tap', () => {
			expect(isDoubleTap(null, 0, 'left', 1000)).toBe(false);
		});
	});

	describe('exceedsTapMovement', () => {
		it('allows movement within threshold', () => {
			expect(exceedsTapMovement(10, 10)).toBe(false);
			expect(exceedsTapMovement(12, 12)).toBe(false);
		});

		it('rejects movement beyond threshold', () => {
			expect(exceedsTapMovement(13, 0)).toBe(true);
			expect(exceedsTapMovement(0, 13)).toBe(true);
		});
	});

	describe('isSwipeUp', () => {
		it('detects upward swipe within threshold', () => {
			expect(isSwipeUp(-50, 5, 300)).toBe(true);
			expect(isSwipeUp(-40, 0, 400)).toBe(true);
		});

		it('rejects horizontal or short swipes', () => {
			expect(isSwipeUp(-50, 60, 300)).toBe(false);
			expect(isSwipeUp(-20, 0, 300)).toBe(false);
			expect(isSwipeUp(-50, 0, 500)).toBe(false);
			expect(isSwipeUp(50, 0, 300)).toBe(false);
		});
	});

	describe('isSwipeDown', () => {
		it('detects downward swipe within threshold', () => {
			expect(isSwipeDown(50, 5, 300)).toBe(true);
			expect(isSwipeDown(40, 0, 400)).toBe(true);
		});

		it('rejects horizontal or short swipes', () => {
			expect(isSwipeDown(50, 60, 300)).toBe(false);
			expect(isSwipeDown(20, 0, 300)).toBe(false);
			expect(isSwipeDown(50, 0, 500)).toBe(false);
			expect(isSwipeDown(-50, 0, 300)).toBe(false);
		});
	});

	describe('isSwipeBack', () => {
		it('detects rightward swipe within threshold', () => {
			expect(isSwipeBack(50, 5, 300)).toBe(true);
			expect(isSwipeBack(48, 0, 500)).toBe(true);
		});

		it('rejects leftward, vertical, short, or slow swipes', () => {
			expect(isSwipeBack(-50, 5, 300)).toBe(false);
			expect(isSwipeBack(50, 60, 300)).toBe(false);
			expect(isSwipeBack(20, 0, 300)).toBe(false);
			expect(isSwipeBack(50, 0, 600)).toBe(false);
		});
	});

	describe('playing-only WPM swipe gate', () => {
		function wouldAdjustWpmFromSwipe(
			isPlaying: boolean,
			dy: number,
			dx: number,
			elapsed: number
		): 'up' | 'down' | null {
			if (!isPlaying) {
				return null;
			}
			if (isSwipeUp(dy, dx, elapsed)) {
				return 'up';
			}
			if (isSwipeDown(dy, dx, elapsed)) {
				return 'down';
			}
			return null;
		}

		it('allows vertical swipes only while playing', () => {
			expect(wouldAdjustWpmFromSwipe(true, -50, 5, 300)).toBe('up');
			expect(wouldAdjustWpmFromSwipe(true, 50, 5, 300)).toBe('down');
			expect(wouldAdjustWpmFromSwipe(false, -50, 5, 300)).toBeNull();
			expect(wouldAdjustWpmFromSwipe(false, 50, 5, 300)).toBeNull();
		});
	});
});
