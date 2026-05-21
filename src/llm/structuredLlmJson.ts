import type { LlmClient } from './LlmClient';

export class StructuredOutputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'StructuredOutputError';
	}
}

const RETRY_NUDGE = `

IMPORTANT: Your previous output could not be parsed as required. Respond again with ONLY the valid JSON specified in the system prompt — no markdown fences, no commentary outside JSON.`;

/**
 * Call LLM once; if `parse` returns null, append a correction nudge and call once more.
 * PRD: one retry on malformed structured output, then fail.
 */
export async function runLlmParseWithRetry<T>(
	llm: LlmClient,
	opts: {
		systemPrompt: string;
		userPrompt: string;
		parse: (raw: string) => T | null;
		failureMessage: string;
	}
): Promise<T> {
	let raw = await llm.complete(opts.systemPrompt, opts.userPrompt);
	let v = opts.parse(raw);
	if (v !== null) {
		return v;
	}
	raw = await llm.complete(
		opts.systemPrompt,
		opts.userPrompt + RETRY_NUDGE
	);
	v = opts.parse(raw);
	if (v !== null) {
		return v;
	}
	throw new StructuredOutputError(opts.failureMessage);
}
