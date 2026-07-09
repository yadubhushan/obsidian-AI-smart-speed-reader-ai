import { describe, expect, it } from 'vitest';
import {
	countdownText,
	createInterSectionCountdown,
	INTER_SECTION_MS
} from '../src/ui/readerShell/interSectionOverlay';

interface FakeTimer {
	id: number;
	cb: () => void;
	ms: number;
	cleared: boolean;
}

function createHarness(durationMs?: number) {
	const timeouts: FakeTimer[] = [];
	const intervals: FakeTimer[] = [];
	const events: string[] = [];
	let nextId = 1;

	const controller = createInterSectionCountdown({
		onShow: (label, title, seconds) => events.push(`show:${label}:${title}:${seconds}`),
		onCountdownTick: (seconds) => events.push(`tick:${seconds}`),
		onHide: () => events.push('hide'),
		schedule: (cb, ms) => {
			const id = nextId++;
			timeouts.push({ id, cb, ms, cleared: false });
			return id;
		},
		clear: (id) => {
			const hit = timeouts.find((t) => t.id === id);
			if (hit) hit.cleared = true;
		},
		scheduleInterval: (cb, ms) => {
			const id = nextId++;
			intervals.push({ id, cb, ms, cleared: false });
			return id;
		},
		clearInterval: (id) => {
			const hit = intervals.find((t) => t.id === id);
			if (hit) hit.cleared = true;
		},
		durationMs
	});

	return { controller, timeouts, intervals, events };
}

describe('createInterSectionCountdown', () => {
	it('shows with a 5-second countdown and schedules auto-advance', () => {
		const { controller, timeouts, intervals, events } = createHarness();
		let continued = 0;

		controller.show('Next section', 'Chapter Two', () => continued++);

		expect(controller.isVisible()).toBe(true);
		expect(events).toEqual(['show:Next section:Chapter Two:5']);
		expect(timeouts).toHaveLength(1);
		expect(timeouts[0]!.ms).toBe(INTER_SECTION_MS);
		expect(intervals).toHaveLength(1);
		expect(intervals[0]!.ms).toBe(1000);
		expect(continued).toBe(0);
	});

	it('ticks down each second and stops ticking at zero', () => {
		const { controller, intervals, events } = createHarness();
		controller.show('Next section', 'Two', () => undefined);

		const tick = intervals[0]!.cb;
		tick(); // 4
		tick(); // 3
		tick(); // 2
		tick(); // 1
		tick(); // 0 → clears interval, no tick event

		expect(events.filter((e) => e.startsWith('tick:'))).toEqual([
			'tick:4',
			'tick:3',
			'tick:2',
			'tick:1'
		]);
		expect(intervals[0]!.cleared).toBe(true);
	});

	it('auto-continues exactly once when the timeout fires', () => {
		const { controller, timeouts, events } = createHarness();
		let continued = 0;
		controller.show('Next section', 'Two', () => continued++);

		timeouts[0]!.cb();

		expect(continued).toBe(1);
		expect(events.at(-1)).toBe('hide');
		expect(controller.isVisible()).toBe(false);

		// A stale timeout firing again must not continue twice.
		timeouts[0]!.cb();
		expect(continued).toBe(1);
	});

	it('dismiss (Continue now) fires the pending continue and cancels timers', () => {
		const { controller, timeouts, intervals } = createHarness();
		let continued = 0;
		controller.show('Next section', 'Two', () => continued++);

		controller.dismiss();

		expect(continued).toBe(1);
		expect(timeouts[0]!.cleared).toBe(true);
		expect(intervals[0]!.cleared).toBe(true);

		controller.dismiss();
		expect(continued).toBe(1);
	});

	it('clearTimers cancels the countdown without continuing (close path)', () => {
		const { controller, timeouts, intervals } = createHarness();
		let continued = 0;
		controller.show('Next section', 'Two', () => continued++);

		controller.clearTimers();

		expect(continued).toBe(0);
		expect(timeouts[0]!.cleared).toBe(true);
		expect(intervals[0]!.cleared).toBe(true);
	});

	it('re-show resets timers and replaces the continue callback', () => {
		const { controller, timeouts } = createHarness();
		let first = 0;
		let second = 0;

		controller.show('Next section', 'Two', () => first++);
		controller.show('Next section', 'Three', () => second++);

		expect(timeouts[0]!.cleared).toBe(true);
		timeouts[1]!.cb();
		expect(first).toBe(0);
		expect(second).toBe(1);
	});

	it('respects a custom duration', () => {
		const { controller, timeouts, events } = createHarness(3000);
		controller.show('Next chapter', 'Two', () => undefined);

		expect(events[0]).toBe('show:Next chapter:Two:3');
		expect(timeouts[0]!.ms).toBe(3000);
	});
});

describe('countdownText', () => {
	it('pluralizes seconds', () => {
		expect(countdownText(1)).toBe('Starting next in 1 second…');
		expect(countdownText(4)).toBe('Starting next in 4 seconds…');
	});
});
