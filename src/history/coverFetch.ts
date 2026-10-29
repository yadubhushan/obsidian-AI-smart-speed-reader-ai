import { requestUrl } from 'obsidian';
import { createRateLimitedFetch } from './rateLimitedFetch';

/**
 * The one fetch every cover lookup goes through (picker and delete flow alike), so they
 * share a per-host request budget. `requestUrl` skips CORS, which Open Library's
 * redirects otherwise trip over.
 *
 * Google Books' 429 is a daily quota shared by all keyless callers, so retrying it only
 * burns more of that quota; the lookup falls back to Open Library instead.
 */
export const coverFetch = createRateLimitedFetch(
	async (input: RequestInfo | URL) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const res = await requestUrl({ url, throw: false });
		return new Response(res.arrayBuffer, { status: res.status, headers: res.headers });
	},
	{ noRetryHosts: new Set(['www.googleapis.com']) }
);
