import { describe, expect, it } from 'vitest';
import {
	createEdgeScrubController,
	getScrubHoldDelay,
	getScrubStepSize,
	SCRUB_RAMP_START_MS,
	type EdgeScrubSide
} from '../src/ui/readerShell/edgeScrub';

interface FakeTimeout {
	id: number;
	cb: () => void;
	ms: number;
	cleared: boolean;
}

function createHarness() {
	let nowMs = 0;
	let nextId = 1;
	const timeouts: FakeTimeout[] = [];
	const steps: Array<{ side: EdgeScrubSide; count: number }> = [];
	const holdSides: Array<EdgeScrubSide | null> = [];

	const controller = createEdgeScrubController({
		onStep: (side, count) => steps.push({ side, count }),
		setHoldSide: (side) => holdSides.push(side),
		schedule: (cb, ms) => {
			const id = nextId++;
			timeouts.push({ id, cb, ms, cleared: false });
			return id;
		},
		clear: (id) => {
			const hit = timeouts.find((t) => t.id === id);
			if (hit) hit.cleared = true;
		},
		now: () => nowMs
	});

	return {
		controller,
		timeouts,
		steps,
		holdSides,
		advance(ms: number) {
			nowMs += ms;
		},
		firePending() {
			const pending = timeouts.filter((t) => !t.cleared && !('fired' in t));
			const last = pending.at(-1);
			if (!last) throw new Error('no pending timeout');
			(last as FakeTimeout & { fired?: boolean }).fired = true;
			last.cb();
		}
	};
}

describe('createEdgeScrubController', () => {
	it('steps immediately on start and schedules the next tick', () => {
		const h = createHarness();

		h.controller.start('left');

		expect(h.controller.isScrubbing()).toBe(true);
		expect(h.steps).toEqual([{ side: 'left', count: 1 }]);
		expect(h.holdSides.at(-1)).toBe('left');
		expect(h.timeouts).toHaveLength(1);
		expect(h.timeouts[0]!.ms).toBe(getScrubHoldDelay(1, 0));
	});

	it('ramps the step size once the hold passes the ramp threshold', () => {
		const h = createHarness();
		h.controller.start('right');

		h.advance(SCRUB_RAMP_START_MS + 1);
		h.firePending();

		const expected = getScrubStepSize(SCRUB_RAMP_START_MS + 1);
		expect(expected).toBeGreaterThan(1);
		expect(h.steps.at(-1)).toEqual({ side: 'right', count: expected });
	});

	it('stop cancels the pending tick, resets state, and clears the hold side', () => {
		const h = createHarness();
		h.controller.start('left');

		h.controller.stop();

		expect(h.controller.isScrubbing()).toBe(false);
		expect(h.timeouts[0]!.cleared).toBe(true);
		expect(h.holdSides.at(-1)).toBeNull();

		// A stale tick firing after stop must not step.
		h.timeouts[0]!.cb();
		expect(h.steps).toHaveLength(1);
	});

	it('restart resets the ramp back to single-word steps', () => {
		const h = createHarness();
		h.controller.start('left');
		h.advance(SCRUB_RAMP_START_MS + 3000);
		h.firePending();
		expect(h.steps.at(-1)!.count).toBeGreaterThan(1);

		h.controller.stop();
		h.controller.start('left');

		expect(h.steps.at(-1)).toEqual({ side: 'left', count: 1 });
	});

	it('starting the other side supersedes the current hold', () => {
		const h = createHarness();
		h.controller.start('left');

		h.controller.start('right');

		expect(h.timeouts[0]!.cleared).toBe(true);
		expect(h.steps.at(-1)).toEqual({ side: 'right', count: 1 });
		// every start begins with a defensive stop(), so each hold is preceded by a clear
		expect(h.holdSides).toEqual([null, 'left', null, 'right']);
	});
});
