import { describe, it, expect, vi } from 'vitest';
import {
	buildChatCompletionsUrl,
	OpenAiCompatibleClient,
	parseOpenAiCompatibleResponse,
	resolveApiBaseUrl,
	runOpenAiCompatibleSmokeTest
} from '../src/llm/OpenAiCompatibleClient';
import { LlmClientError } from '../src/llm/LlmClient';

describe('resolveApiBaseUrl', () => {
	it('returns OpenAI preset', () => {
		expect(resolveApiBaseUrl('openai', '')).toBe('https://api.openai.com/v1');
	});

	it('returns OpenRouter preset', () => {
		expect(resolveApiBaseUrl('openrouter', '')).toBe('https://openrouter.ai/api/v1');
	});

	it('uses custom base URL', () => {
		expect(resolveApiBaseUrl('custom', 'https://example.com/v1/')).toBe(
			'https://example.com/v1'
		);
	});

	it('throws when custom base URL is empty', () => {
		expect(() => resolveApiBaseUrl('custom', '')).toThrow(LlmClientError);
	});
});

describe('parseOpenAiCompatibleResponse', () => {
	it('extracts assistant content', () => {
		const text = parseOpenAiCompatibleResponse({
			choices: [{ message: { content: ' {"ok": true} ' } }]
		});
		expect(text).toBe(' {"ok": true} ');
	});

	it('throws on empty choices', () => {
		expect(() => parseOpenAiCompatibleResponse({ choices: [] })).toThrow(LlmClientError);
	});
});

describe('OpenAiCompatibleClient', () => {
	it('posts chat completion request and returns content', async () => {
		const requestFn = vi.fn(async () => ({
			status: 200,
			json: { choices: [{ message: { content: 'hello' } }] },
			text: ''
		}));
		const client = new OpenAiCompatibleClient(
			{
				apiKey: 'sk-test',
				model: 'gpt-4o-mini',
				baseUrl: 'https://api.openai.com/v1',
				preset: 'openai',
				timeoutSeconds: 30
			},
			{ requestFn }
		);

		const out = await client.complete('system', 'user');
		expect(out).toBe('hello');
		expect(requestFn).toHaveBeenCalledOnce();
		const call = requestFn.mock.calls[0]![0];
		expect(call.url).toBe(buildChatCompletionsUrl('https://api.openai.com/v1'));
		expect(JSON.parse(call.body)).toMatchObject({
			model: 'gpt-4o-mini',
			stream: false,
			messages: [
				{ role: 'system', content: 'system' },
				{ role: 'user', content: 'user' }
			]
		});
		expect(call.headers.Authorization).toBe('Bearer sk-test');
	});

	it('rejects HTTP errors', async () => {
		const client = new OpenAiCompatibleClient(
			{
				apiKey: 'sk-test',
				model: 'gpt-4o-mini',
				baseUrl: 'https://api.openai.com/v1'
			},
			{
				requestFn: async () => ({
					status: 401,
					json: { error: { message: 'bad key' } },
					text: ''
				})
			}
		);
		await expect(client.complete('s', 'u')).rejects.toThrow(/401/);
	});

	it('requires api key and model at construction', () => {
		expect(
			() =>
				new OpenAiCompatibleClient({
					apiKey: '',
					model: 'gpt-4o-mini',
					baseUrl: 'https://api.openai.com/v1'
				})
		).toThrow(LlmClientError);
	});
});

describe('runOpenAiCompatibleSmokeTest', () => {
	it('returns ok on success', async () => {
		const result = await runOpenAiCompatibleSmokeTest(
			{
				apiKey: 'sk-test',
				model: 'gpt-4o-mini',
				baseUrl: 'https://api.openai.com/v1'
			},
			{
				requestFn: async () => ({
					status: 200,
					json: { choices: [{ message: { content: 'SPEED_READER_PING_OK' } }] },
					text: ''
				})
			}
		);
		expect(result).toEqual({ ok: true, stdout: 'SPEED_READER_PING_OK' });
	});
});
