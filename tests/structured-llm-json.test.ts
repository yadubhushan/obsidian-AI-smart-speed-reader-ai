import { describe, it, expect } from 'vitest';
import type { LlmClient } from '../src/llm/CursorCliClient';
import { runLlmParseWithRetry, StructuredOutputError } from '../src/llm/structuredLlmJson';

describe('runLlmParseWithRetry', () => {
	it('returns first parse success without second call', async () => {
		let calls = 0;
		const llm: LlmClient = {
			complete: async () => {
				calls++;
				return '{"ok":true}';
			}
		};
		const r = await runLlmParseWithRetry(llm, {
			systemPrompt: 's',
			userPrompt: 'u',
			parse: (raw) => {
				try {
					const o = JSON.parse(raw) as { ok?: boolean };
					return o.ok === true ? o : null;
				} catch {
					return null;
				}
			},
			failureMessage: 'fail'
		});
		expect(r.ok).toBe(true);
		expect(calls).toBe(1);
	});

	it('retries once when first parse fails then succeeds', async () => {
		let calls = 0;
		const good = JSON.stringify({ value: 42 });
		const llm: LlmClient = {
			complete: async () => {
				calls++;
				return calls === 1 ? 'garbage' : good;
			}
		};
		const r = await runLlmParseWithRetry(llm, {
			systemPrompt: 's',
			userPrompt: 'u',
			parse: (raw) => {
				try {
					const o = JSON.parse(raw) as { value?: number };
					return typeof o.value === 'number' ? o : null;
				} catch {
					return null;
				}
			},
			failureMessage: 'parse failed'
		});
		expect(r.value).toBe(42);
		expect(calls).toBe(2);
	});

	it('throws StructuredOutputError when both attempts fail parse', async () => {
		let calls = 0;
		const llm: LlmClient = {
			complete: async () => {
				calls++;
				return 'x';
			}
		};
		await expect(
			runLlmParseWithRetry(llm, {
				systemPrompt: 's',
				userPrompt: 'u',
				parse: () => null,
				failureMessage: 'nope'
			})
		).rejects.toThrow(StructuredOutputError);
		expect(calls).toBe(2);
	});
});
