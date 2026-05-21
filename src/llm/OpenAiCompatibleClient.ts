import { requestUrl } from 'obsidian';
import type { LlmClient } from './LlmClient';
import { LlmClientError } from './LlmClient';

export type ApiProviderPreset = 'openai' | 'openrouter' | 'custom';

export const API_PROVIDER_PRESETS: Record<
	Exclude<ApiProviderPreset, 'custom'>,
	{ baseUrl: string; label: string }
> = {
	openai: {
		baseUrl: 'https://api.openai.com/v1',
		label: 'OpenAI'
	},
	openrouter: {
		baseUrl: 'https://openrouter.ai/api/v1',
		label: 'OpenRouter'
	}
};

export interface OpenAiCompatibleOptions {
	apiKey: string;
	model: string;
	baseUrl: string;
	timeoutSeconds?: number;
}

export type OpenAiCompatibleRequestFn = (options: {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string;
	throw: boolean;
}) => Promise<{ status: number; json: unknown; text: string }>;

function resolveBaseUrl(preset: ApiProviderPreset, customBaseUrl: string): string {
	if (preset === 'custom') {
		return customBaseUrl.replace(/\/+$/, '');
	}
	return API_PROVIDER_PRESETS[preset].baseUrl;
}

export function resolveApiBaseUrl(
	preset: ApiProviderPreset,
	customBaseUrl: string
): string {
	const raw = resolveBaseUrl(preset, customBaseUrl).trim();
	if (!raw.length) {
		throw new LlmClientError('API base URL is required when preset is Custom.');
	}
	return raw;
}

export function buildChatCompletionsUrl(baseUrl: string): string {
	return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function buildHeaders(apiKey: string, preset: ApiProviderPreset): Record<string, string> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${apiKey.trim()}`
	};
	if (preset === 'openrouter') {
		headers['HTTP-Referer'] = 'https://obsidian.md';
		headers['X-Title'] = 'Speed Reader AI';
	}
	return headers;
}

function parseChatCompletionContent(json: unknown): string | null {
	if (typeof json !== 'object' || json === null) {
		return null;
	}
	const choices = (json as { choices?: unknown }).choices;
	if (!Array.isArray(choices) || choices.length === 0) {
		return null;
	}
	const first = choices[0];
	if (typeof first !== 'object' || first === null) {
		return null;
	}
	const message = (first as { message?: unknown }).message;
	if (typeof message !== 'object' || message === null) {
		return null;
	}
	const content = (message as { content?: unknown }).content;
	return typeof content === 'string' && content.trim().length ? content : null;
}

export function parseOpenAiCompatibleResponse(json: unknown): string {
	const content = parseChatCompletionContent(json);
	if (!content) {
		throw new LlmClientError('OpenAI-compatible API returned empty or invalid content.');
	}
	return content;
}

export class OpenAiCompatibleClient implements LlmClient {
	private readonly apiKey: string;
	private readonly model: string;
	private readonly baseUrl: string;
	private readonly preset: ApiProviderPreset;
	private readonly timeoutMs: number;
	private readonly requestFn: OpenAiCompatibleRequestFn;

	constructor(
		options: OpenAiCompatibleOptions & { preset?: ApiProviderPreset },
		deps: { requestFn?: OpenAiCompatibleRequestFn } = {}
	) {
		const key = options.apiKey.trim();
		if (!key.length) {
			throw new LlmClientError('API key is required for OpenAI-compatible backend.');
		}
		const model = options.model.trim();
		if (!model.length) {
			throw new LlmClientError('Model id is required for OpenAI-compatible backend.');
		}
		this.apiKey = key;
		this.model = model;
		this.preset = options.preset ?? 'openai';
		this.baseUrl = options.baseUrl.replace(/\/+$/, '');
		this.timeoutMs = Math.max(1, (options.timeoutSeconds ?? 300) * 1000);
		this.requestFn = deps.requestFn ?? defaultRequestFn;
	}

	complete(systemPrompt: string, userPrompt: string): Promise<string> {
		const url = buildChatCompletionsUrl(this.baseUrl);
		const body = JSON.stringify({
			model: this.model,
			stream: false,
			messages: [
				{ role: 'system', content: systemPrompt.trim() },
				{ role: 'user', content: userPrompt.trim() }
			]
		});
		const headers = buildHeaders(this.apiKey, this.preset);

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new LlmClientError('OpenAI-compatible API request timed out.'));
			}, this.timeoutMs);

			void this.requestFn({ url, method: 'POST', headers, body, throw: false })
				.then((response) => {
					clearTimeout(timer);
					if (response.status < 200 || response.status >= 300) {
						const detail =
							typeof response.json === 'object' &&
							response.json !== null &&
							'error' in response.json
								? JSON.stringify((response.json as { error: unknown }).error)
								: response.text.slice(0, 300);
						reject(
							new LlmClientError(
								`OpenAI-compatible API failed (HTTP ${response.status}): ${detail}`
							)
						);
						return;
					}
					try {
						resolve(parseOpenAiCompatibleResponse(response.json));
					} catch (e: unknown) {
						reject(e instanceof Error ? e : new LlmClientError(String(e)));
					}
				})
				.catch((e: unknown) => {
					clearTimeout(timer);
					reject(
						e instanceof Error
							? e
							: new LlmClientError(`OpenAI-compatible API request failed: ${String(e)}`)
					);
				});
		});
	}
}

async function defaultRequestFn(options: {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string;
	throw: boolean;
}): Promise<{ status: number; json: unknown; text: string }> {
	const response = await requestUrl({
		url: options.url,
		method: options.method,
		headers: options.headers,
		body: options.body,
		throw: options.throw
	});
	return {
		status: response.status,
		json: response.json,
		text: response.text
	};
}

export const OPENAI_COMPATIBLE_SMOKE_PROMPTS = {
	system:
		'You are a connectivity check. Follow the user output format literally. Be brief.',
	user: 'Respond with exactly one line containing only this token (no punctuation, no code fences): SPEED_READER_PING_OK'
} as const;

export async function runOpenAiCompatibleSmokeTest(
	options: OpenAiCompatibleOptions & { preset?: ApiProviderPreset },
	deps?: { requestFn?: OpenAiCompatibleRequestFn }
): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
	try {
		const client = new OpenAiCompatibleClient(
			{ ...options, timeoutSeconds: Math.min(options.timeoutSeconds ?? 300, 120) },
			deps ?? {}
		);
		const stdout = await client.complete(
			OPENAI_COMPATIBLE_SMOKE_PROMPTS.system,
			OPENAI_COMPATIBLE_SMOKE_PROMPTS.user
		);
		return { ok: true, stdout };
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : `Smoke test failed: ${String(e)}`;
		return { ok: false, message };
	}
}
