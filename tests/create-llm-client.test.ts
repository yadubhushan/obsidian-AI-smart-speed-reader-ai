import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types';
import {
	createLlmClient,
	isLlmBackendConfigured,
	resolveAutoBackend,
	SettingsBackedLlmClient
} from '../src/llm/createLlmClient';
import { LlmClientError } from '../src/llm/LlmClient';

function withAi(overrides: Partial<typeof DEFAULT_SETTINGS.ai>) {
	return {
		...DEFAULT_SETTINGS,
		ai: { ...DEFAULT_SETTINGS.ai, ...overrides }
	};
}

describe('resolveAutoBackend', () => {
	it('prefers cursor-cli on desktop when resolvable', () => {
		expect(
			resolveAutoBackend(DEFAULT_SETTINGS, {
				isDesktopApp: true,
				canResolveCursorCli: () => true
			})
		).toBe('cursor-cli');
	});

	it('falls back to ai-providers on desktop when cursor unavailable', () => {
		expect(
			resolveAutoBackend(withAi({ aiProvidersProviderId: 'p1' }), {
				isDesktopApp: true,
				canResolveCursorCli: () => false
			})
		).toBe('ai-providers');
	});

	it('falls back to api key on mobile', () => {
		expect(
			resolveAutoBackend(withAi({ apiKey: 'sk-test', apiModel: 'gpt-4o-mini' }), {
				isDesktopApp: false,
				canResolveCursorCli: () => true
			})
		).toBe('openai-compatible');
	});

	it('throws when nothing configured on mobile', () => {
		expect(() =>
			resolveAutoBackend(DEFAULT_SETTINGS, {
				isDesktopApp: false,
				canResolveCursorCli: () => false
			})
		).toThrow(LlmClientError);
	});
});

describe('isLlmBackendConfigured', () => {
	it('returns false for unconfigured auto', () => {
		expect(
			isLlmBackendConfigured(DEFAULT_SETTINGS, {
				isDesktopApp: false,
				canResolveCursorCli: () => false
			})
		).toBe(false);
	});

	it('returns true when api key configured', () => {
		expect(
			isLlmBackendConfigured(withAi({ apiKey: 'sk-test', apiModel: 'gpt-4o-mini' }), {
				isDesktopApp: false,
				canResolveCursorCli: () => false
			})
		).toBe(true);
	});
});

describe('createLlmClient', () => {
	it('creates openai-compatible client for explicit mode', async () => {
		const complete = vi.fn(async () => 'ok');
		const client = createLlmClient({
			getSettings: () =>
				withAi({
					llmBackend: 'openai-compatible',
					apiKey: 'sk-test',
					apiModel: 'gpt-4o-mini'
				}),
			getAiProviders: async () => null
		});
		Object.assign(client, { complete });
		expect(client).toBeDefined();
	});
});

describe('SettingsBackedLlmClient', () => {
	it('delegates to resolved backend', async () => {
		const execute = vi.fn(async () => 'from-providers');
		const client = new SettingsBackedLlmClient({
			getSettings: () => withAi({ llmBackend: 'ai-providers', aiProvidersProviderId: 'p1' }),
			getAiProviders: async () => ({
				providers: [{ id: 'p1', name: 'Test' }],
				execute
			})
		});
		const out = await client.complete('sys', 'user');
		expect(out).toBe('from-providers');
		expect(execute).toHaveBeenCalledOnce();
	});
});
