import { waitForAI, type IChatMessage, type IAIProvider } from '@obsidian-ai-providers/sdk';
import type { App } from 'obsidian';
import type { AiProvidersExecuteApi } from './AiProvidersLlmClient';

export async function getAiProvidersApi(_app: App): Promise<AiProvidersExecuteApi | null> {
	try {
		const aiResolver = await waitForAI();
		const aiProviders = await aiResolver.promise;
		return {
			providers: aiProviders.providers.map((provider) => ({
				id: provider.id,
				name: provider.name,
				model: provider.model,
				type: provider.type
			})),
			execute: (options) => {
				const messages: IChatMessage[] = options.messages.map((message) => ({
					role: message.role as IChatMessage['role'],
					content: message.content
				}));
				return aiProviders.execute({
					provider: options.provider as IAIProvider,
					model: options.model,
					messages,
					abortController: options.abortController
				}) as Promise<string>;
			}
		};
	} catch {
		return null;
	}
}
