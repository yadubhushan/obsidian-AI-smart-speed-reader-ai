import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types';
import {
	AiProvidersLlmClient,
	runAiProvidersSmokeTest
} from '../src/llm/AiProvidersLlmClient';
import { LlmClientError } from '../src/llm/LlmClient';

describe('AiProvidersLlmClient', () => {
	it('maps system and user messages to execute()', async () => {
		const execute = vi.fn(async () => 'assistant text');
		const client = new AiProvidersLlmClient({
			providerId: 'p1',
			timeoutSeconds: 30,
			getAiProviders: async () => ({
				providers: [{ id: 'p1', name: 'OpenAI', model: 'gpt-4o' }],
				execute
			})
		});

		const out = await client.complete('system prompt', 'user prompt');
		expect(out).toBe('assistant text');
		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: { id: 'p1', name: 'OpenAI', model: 'gpt-4o' },
				messages: [
					{ role: 'system', content: 'system prompt' },
					{ role: 'user', content: 'user prompt' }
				]
			})
		);
	});

	it('throws when provider id missing from plugin list', async () => {
		const client = new AiProvidersLlmClient({
			providerId: 'missing',
			getAiProviders: async () => ({
				providers: [{ id: 'p1', name: 'Other' }],
				execute: vi.fn()
			})
		});
		await expect(client.complete('s', 'u')).rejects.toThrow(/not found/i);
	});

	it('throws when AI Providers plugin unavailable', async () => {
		const client = new AiProvidersLlmClient({
			providerId: 'p1',
			getAiProviders: async () => null
		});
		await expect(client.complete('s', 'u')).rejects.toThrow(/not available/i);
	});

	it('requires provider id at construction', () => {
		expect(
			() =>
				new AiProvidersLlmClient({
					providerId: '',
					getAiProviders: async () => null
				})
		).toThrow(LlmClientError);
	});
});

describe('runAiProvidersSmokeTest', () => {
	it('returns ok on success', async () => {
		const result = await runAiProvidersSmokeTest(
			{
				providerId: 'p1',
				getAiProviders: async () => ({
					providers: [{ id: 'p1', name: 'Test' }],
					execute: async () => 'SPEED_READER_PING_OK'
				})
			},
			{
				getAiProviders: async () => ({
					providers: [{ id: 'p1', name: 'Test' }],
					execute: async () => 'SPEED_READER_PING_OK'
				})
			}
		);
		expect(result).toEqual({ ok: true, stdout: 'SPEED_READER_PING_OK' });
	});
});
