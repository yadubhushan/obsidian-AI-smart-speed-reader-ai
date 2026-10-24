import { describe, it, expect } from 'vitest';
import {
	planStreakFrames,
	STREAK_MAX_FRAMES,
	STREAK_MIN_FRAME_MS,
	STREAK_TOTAL_MS
} from '../src/ui/readerShell/navStreak';

const words = (count: number) => Array.from({ length: count }, (_, i) => `w${i}`);

describe('planStreakFrames', () => {
	it('plays a backward jump in reverse reading order', () => {
		const frames = planStreakFrames(['w0', 'w1', 'w2', 'w3'], 'back');
		expect(frames.map((f) => f.text)).toEqual(['w2', 'w1']);
	});

	it('plays a forward jump in reading order', () => {
		const frames = planStreakFrames(['w0', 'w1', 'w2', 'w3'], 'forward');
		expect(frames.map((f) => f.text)).toEqual(['w1', 'w2']);
	});

	it('drops the endpoints, which the reader itself renders', () => {
		expect(planStreakFrames(['only'], 'back')).toEqual([]);
		expect(planStreakFrames(['from', 'to'], 'back')).toEqual([]);
		expect(planStreakFrames([], 'forward')).toEqual([]);
	});

	it('thins a long jump down to a capped number of frames', () => {
		const frames = planStreakFrames(words(400), 'back');
		expect(frames).toHaveLength(STREAK_MAX_FRAMES);
		expect(frames[0]!.text).toBe('w398');
		expect(frames.at(-1)!.text).toBe('w1');
	});

	it('keeps the whole streak inside the time budget', () => {
		const total = planStreakFrames(words(400), 'back').reduce((sum, f) => sum + f.durationMs, 0);
		expect(total).toBeLessThanOrEqual(STREAK_TOTAL_MS + STREAK_MAX_FRAMES);
	});

	it('never flashes a frame too briefly to read', () => {
		const frames = planStreakFrames(words(40), 'back', { maxFrames: 40 });
		for (const frame of frames) {
			expect(frame.durationMs).toBeGreaterThanOrEqual(STREAK_MIN_FRAME_MS);
		}
	});

	it('skips blank tokens', () => {
		const frames = planStreakFrames(['a', ' ', '', 'b', 'c'], 'forward');
		expect(frames.map((f) => f.text)).toEqual(['b']);
	});
});
