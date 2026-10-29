type FetchLike = typeof fetch;

export interface RateLimitOptions {
	/** Minimum gap between request starts to the same host. */
	minIntervalMs: number;
	/** Retries after the first attempt when the server answers 429 or 503. */
	maxRetries: number;
	/** First backoff when the server sends no Retry-After; doubles each retry. */
	baseDelayMs: number;
	/** Cap for any single wait, including a server-sent Retry-After. */
	maxDelayMs: number;
	/** Hosts whose 429/503 answers are returned as-is instead of retried. */
	noRetryHosts?: ReadonlySet<string>;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	random?: () => number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
	minIntervalMs: 1000,
	maxRetries: 3,
	baseDelayMs: 1500,
	maxDelayMs: 30_000
};

const RETRYABLE_STATUS = new Set([429, 503]);

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function requestUrlOf(input: RequestInfo | URL): string {
	if (typeof input === 'string') {
		return input;
	}
	return input instanceof URL ? input.href : input.url;
}

function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

/** Parse Retry-After as seconds or an HTTP date; `null` when absent or unreadable. */
export function parseRetryAfterMs(value: string | null, now: number): number | null {
	if (!value) {
		return null;
	}
	const seconds = Number(value.trim());
	if (Number.isFinite(seconds)) {
		return Math.max(0, seconds * 1000);
	}
	const date = Date.parse(value);
	return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/**
 * Wrap a fetch so requests to each host are spaced out, and 429/503 answers are retried
 * with Retry-After or exponential backoff. A backoff also holds back every other queued
 * request to that host, so one throttled call doesn't let the rest pile on.
 */
export function createRateLimitedFetch(
	fetchImpl: FetchLike,
	options: Partial<RateLimitOptions> = {}
): FetchLike {
	const opts = { ...DEFAULT_RATE_LIMIT, ...options };
	const sleep = opts.sleep ?? defaultSleep;
	const now = opts.now ?? Date.now;
	const random = opts.random ?? Math.random;
	const nextSlotByHost = new Map<string, number>();

	async function waitForSlot(host: string): Promise<void> {
		const current = now();
		const slot = Math.max(current, nextSlotByHost.get(host) ?? 0);
		// Reserve before awaiting so concurrent callers queue behind this one.
		nextSlotByHost.set(host, slot + opts.minIntervalMs);
		if (slot > current) {
			await sleep(slot - current);
		}
	}

	function backoffMs(response: Response, attempt: number): number {
		const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'), now());
		const exponential = opts.baseDelayMs * 2 ** attempt * (1 + random() * 0.25);
		return Math.min(opts.maxDelayMs, retryAfter ?? exponential);
	}

	return async (input: RequestInfo | URL, init?: RequestInit) => {
		const host = hostOf(requestUrlOf(input));
		for (let attempt = 0; ; attempt += 1) {
			await waitForSlot(host);
			const response = init === undefined ? await fetchImpl(input) : await fetchImpl(input, init);
			if (
				!RETRYABLE_STATUS.has(response.status) ||
				attempt >= opts.maxRetries ||
				opts.noRetryHosts?.has(host)
			) {
				return response;
			}
			const delay = backoffMs(response, attempt);
			nextSlotByHost.set(host, Math.max(nextSlotByHost.get(host) ?? 0, now() + delay));
		}
	};
}
