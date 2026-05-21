export interface LlmClient {
	complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

export class LlmClientError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LlmClientError';
	}
}
