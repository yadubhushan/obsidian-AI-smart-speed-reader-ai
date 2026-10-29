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
 * Models often wrap JSON in ```json fences or a sentence of preamble. Returns the
 * fenced body, else the outermost `{...}` span, else null when there is nothing to salvage.
 */
export function extractJsonCandidate(raw: string): string | null {
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
	if (fenced?.[1]?.trim()) {
		return fenced[1].trim();
	}
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	return start >= 0 && end > start ? raw.slice(start, end + 1) : null;
}

function parseLenient<T>(raw: string, parse: (raw: string) => T | null): T | null {
	const direct = parse(raw);
	if (direct !== null) {
		return direct;
	}
	const candidate = extractJsonCandidate(raw);
	return candidate !== null && candidate !== raw ? parse(candidate) : null;
}

/**
 * Call LLM once; if `parse` returns null (even after unwrapping fences), append a
 * correction nudge and call once more — the retry is a paid call, so salvage first.
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
	let v = parseLenient(raw, opts.parse);
	if (v !== null) {
		return v;
	}
	raw = await llm.complete(
		opts.systemPrompt,
		opts.userPrompt + RETRY_NUDGE
	);
	v = parseLenient(raw, opts.parse);
	if (v !== null) {
		return v;
	}
	throw new StructuredOutputError(opts.failureMessage);
}
