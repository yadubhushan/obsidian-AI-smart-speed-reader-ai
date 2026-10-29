import type { SpeedReaderAiSettings } from '../types';
import type { AiProviderRecord, AiProvidersExecuteApi } from './AiProvidersLlmClient';
import { AiProvidersLlmClient } from './AiProvidersLlmClient';
import type { LlmClient } from './LlmClient';

/** All LLM work goes through the AI Providers plugin; this is the only backend. */
export function isLlmConfigured(settings: SpeedReaderAiSettings): boolean {
	return settings.ai.aiProvidersProviderId.trim().length > 0;
}

/** Reads current settings on each call so provider changes apply without recreating clients. */
export function createLlmClient(
	getSettings: () => SpeedReaderAiSettings,
	getAiProviders: () => Promise<AiProvidersExecuteApi | null>
): LlmClient {
	return {
		complete(systemPrompt: string, userPrompt: string): Promise<string> {
			const ai = getSettings().ai;
			const client = new AiProvidersLlmClient({
				providerId: ai.aiProvidersProviderId,
				modelOverride: ai.aiProvidersModelOverride,
				timeoutSeconds: ai.timeoutSeconds,
				getAiProviders
			});
			return client.complete(systemPrompt, userPrompt);
		}
	};
}

/** Model name recorded in prepare cache metadata. */
export async function resolveModelLabel(
	settings: SpeedReaderAiSettings,
	getAiProviders: () => Promise<AiProvidersExecuteApi | null>
): Promise<string> {
	const override = settings.ai.aiProvidersModelOverride.trim();
	if (override) {
		return override;
	}
	const api = await getAiProviders();
	const provider: AiProviderRecord | undefined = api?.providers.find(
		(p) => p.id === settings.ai.aiProvidersProviderId
	);
	return provider?.model || provider?.name || 'ai-providers';
}
