import { describe, expect, it, vi } from 'vitest';
import { createRateLimitedFetch, parseRetryAfterMs } from '../src/history/rateLimitedFetch';

function fakeClock() {
	let time = 0;
	const sleeps: number[] = [];
	return {
		now: () => time,
		sleep: async (ms: number) => {
			sleeps.push(ms);
			time += ms;
		},
		sleeps
	};
}

function respond(status: number, headers: Record<string, string> = {}): Response {
	return new Response(status === 200 ? '{}' : null, { status, headers });
}

describe('createRateLimitedFetch', () => {
	it('retries a 429 using Retry-After, then returns the success', async () => {
		const clock = fakeClock();
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(respond(429, { 'retry-after': '2' }))
			.mockResolvedValueOnce(respond(200));
		const limited = createRateLimitedFetch(fetchImpl as unknown as typeof fetch, {
			...clock,
			random: () => 0
		});

		const res = await limited('https://api.example.com/a');

		expect(res.status).toBe(200);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://api.example.com/a');
		expect(clock.sleeps).toEqual([2000]);
	});

	it('backs off exponentially without Retry-After and gives up after maxRetries', async () => {
		const clock = fakeClock();
		const fetchImpl = vi.fn().mockImplementation(async () => respond(429));
		const limited = createRateLimitedFetch(fetchImpl as unknown as typeof fetch, {
			...clock,
			random: () => 0,
			minIntervalMs: 0,
			baseDelayMs: 100,
			maxRetries: 2
		});

		const res = await limited('https://api.example.com/a');

		expect(res.status).toBe(429);
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		expect(clock.sleeps).toEqual([100, 200]);
	});

	it('spaces requests to the same host but not across hosts', async () => {
		const clock = fakeClock();
		const fetchImpl = vi.fn().mockImplementation(async () => respond(200));
		const limited = createRateLimitedFetch(fetchImpl as unknown as typeof fetch, {
			...clock,
			minIntervalMs: 500
		});

		await limited('https://a.example.com/1');
		await limited('https://b.example.com/1');
		await limited('https://a.example.com/2');

		expect(clock.sleeps).toEqual([500]);
	});

	it('does not retry ordinary errors', async () => {
		const clock = fakeClock();
		const fetchImpl = vi.fn().mockResolvedValue(respond(404));
		const limited = createRateLimitedFetch(fetchImpl as unknown as typeof fetch, clock);

		expect((await limited('https://api.example.com/a')).status).toBe(404);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('caps a long Retry-After at maxDelayMs', async () => {
		const clock = fakeClock();
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(respond(429, { 'retry-after': '3600' }))
			.mockResolvedValueOnce(respond(200));
		const limited = createRateLimitedFetch(fetchImpl as unknown as typeof fetch, {
			...clock,
			maxDelayMs: 5000
		});

		await limited('https://api.example.com/a');
		expect(clock.sleeps).toEqual([5000]);
	});
});

describe('parseRetryAfterMs', () => {
	it('reads seconds and HTTP dates', () => {
		expect(parseRetryAfterMs('3', 0)).toBe(3000);
		expect(parseRetryAfterMs(new Date(10_000).toUTCString(), 4000)).toBe(6000);
		expect(parseRetryAfterMs(null, 0)).toBeNull();
		expect(parseRetryAfterMs('soon', 0)).toBeNull();
	});
});
