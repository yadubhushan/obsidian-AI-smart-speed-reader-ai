import type { LlmClient } from './LlmClient';
import { LlmClientError } from './LlmClient';

export interface AiProviderRecord {
	id: string;
	name: string;
	model?: string;
	type?: string;
}

export interface AiProvidersExecuteApi {
	execute(options: {
		provider: AiProviderRecord;
		model?: string;
		messages: Array<{ role: string; content: string }>;
		abortController?: AbortController;
	}): Promise<string>;
	providers: AiProviderRecord[];
}

export interface AiProvidersLlmClientOptions {
	providerId: string;
	modelOverride?: string;
	timeoutSeconds?: number;
	getAiProviders: () => Promise<AiProvidersExecuteApi | null>;
}

export class AiProvidersLlmClient implements LlmClient {
	private readonly providerId: string;
	private readonly modelOverride: string | undefined;
	private readonly timeoutMs: number;
	private readonly getAiProviders: () => Promise<AiProvidersExecuteApi | null>;

	constructor(options: AiProvidersLlmClientOptions) {
		const id = options.providerId.trim();
		if (!id.length) {
			throw new LlmClientError('AI Providers provider id is required.');
		}
		this.providerId = id;
		this.modelOverride = options.modelOverride?.trim() || undefined;
		this.timeoutMs = Math.max(1, (options.timeoutSeconds ?? 300) * 1000);
		this.getAiProviders = options.getAiProviders;
	}

	async complete(systemPrompt: string, userPrompt: string): Promise<string> {
		const aiProviders = await this.getAiProviders();
		if (!aiProviders) {
			throw new LlmClientError(
				'AI Providers plugin is not available. Install and enable it in Settings → Community plugins.'
			);
		}

		const provider = aiProviders.providers.find((p) => p.id === this.providerId);
		if (!provider) {
			throw new LlmClientError(
				'Selected AI Providers entry was not found. Re-select a provider in Settings → Speed Reader AI.'
			);
		}

		const abortController = new AbortController();
		const timer = setTimeout(() => abortController.abort(), this.timeoutMs);

		try {
			const text = await aiProviders.execute({
				provider,
				model: this.modelOverride,
				messages: [
					{ role: 'system', content: systemPrompt.trim() },
					{ role: 'user', content: userPrompt.trim() }
				],
				abortController
			});
			if (!text.trim()) {
				throw new LlmClientError('AI Providers returned empty output.');
			}
			return text;
		} catch (e: unknown) {
			if (e instanceof Error && e.message === 'Aborted') {
				throw new LlmClientError('AI Providers request timed out.');
			}
			throw e instanceof Error ? e : new LlmClientError(String(e));
		} finally {
			clearTimeout(timer);
		}
	}
}

export const AI_PROVIDERS_SMOKE_PROMPTS = {
	system:
		'You are a connectivity check. Follow the user output format literally. Be brief.',
	user: 'Respond with exactly one line containing only this token (no punctuation, no code fences): SPEED_READER_PING_OK'
} as const;

export async function runAiProvidersSmokeTest(
	options: AiProvidersLlmClientOptions,
	deps?: { getAiProviders?: () => Promise<AiProvidersExecuteApi | null> }
): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
	try {
		const client = new AiProvidersLlmClient({
			...options,
			timeoutSeconds: Math.min(options.timeoutSeconds ?? 300, 120),
			getAiProviders: deps?.getAiProviders ?? options.getAiProviders
		});
		const stdout = await client.complete(
			AI_PROVIDERS_SMOKE_PROMPTS.system,
			AI_PROVIDERS_SMOKE_PROMPTS.user
		);
		return { ok: true, stdout };
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : `Smoke test failed: ${String(e)}`;
		return { ok: false, message };
	}
}
