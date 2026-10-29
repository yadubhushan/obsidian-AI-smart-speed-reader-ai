import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type SpeedReaderAiSettings } from '../src/types';
import type { AiProvidersExecuteApi } from '../src/llm/AiProvidersLlmClient';
import { createLlmClient, isLlmConfigured, resolveModelLabel } from '../src/llm/llmClientFactory';

function withAi(ai: Partial<SpeedReaderAiSettings['ai']>): SpeedReaderAiSettings {
	return { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai, ...ai } };
}

function fakeAiProviders(calls: Array<{ model?: string; providerId: string }>): AiProvidersExecuteApi {
	return {
		providers: [{ id: 'p1', name: 'OpenRouter', model: 'provider-model' }],
		execute: async (options) => {
			calls.push({ model: options.model, providerId: options.provider.id });
			return 'ok';
		}
	};
}

describe('isLlmConfigured', () => {
	it('requires an AI Providers entry', () => {
		expect(isLlmConfigured(DEFAULT_SETTINGS)).toBe(false);
		expect(isLlmConfigured(withAi({ aiProvidersProviderId: 'p1' }))).toBe(true);
	});
});

describe('createLlmClient', () => {
	it('routes through the selected provider and reads settings per call', async () => {
		const calls: Array<{ model?: string; providerId: string }> = [];
		let settings = withAi({ aiProvidersProviderId: 'p1' });
		const client = createLlmClient(() => settings, async () => fakeAiProviders(calls));

		await expect(client.complete('sys', 'user')).resolves.toBe('ok');
		settings = withAi({ aiProvidersProviderId: 'p1', aiProvidersModelOverride: 'override-model' });
		await client.complete('sys', 'user');

		expect(calls).toEqual([
			{ model: undefined, providerId: 'p1' },
			{ model: 'override-model', providerId: 'p1' }
		]);
	});

	it('fails clearly when AI Providers is not installed', async () => {
		const client = createLlmClient(() => withAi({ aiProvidersProviderId: 'p1' }), async () => null);
		await expect(client.complete('sys', 'user')).rejects.toThrow(/AI Providers plugin is not available/);
	});
});

describe('resolveModelLabel', () => {
	it('prefers the override, then the provider model', async () => {
		const api = async () => fakeAiProviders([]);
		expect(await resolveModelLabel(withAi({ aiProvidersProviderId: 'p1' }), api)).toBe('provider-model');
		expect(
			await resolveModelLabel(withAi({ aiProvidersProviderId: 'p1', aiProvidersModelOverride: 'x' }), api)
		).toBe('x');
		expect(await resolveModelLabel(withAi({ aiProvidersProviderId: 'p1' }), async () => null)).toBe(
			'ai-providers'
		);
	});
});
