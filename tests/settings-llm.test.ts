import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types';
import { createDefaultLlmModelCatalog } from '../src/llm/llmModelCatalog';
import {
	MIN_PREPARE_SINGLE_CALL_MAX_CHARS,
	MIN_PREPARE_SINGLE_CALL_MAX_LINES,
	MIN_TIMEOUT_SECONDS,
	validateSettings
} from '../src/services/settingsValidator';

const defaultCatalog = createDefaultLlmModelCatalog();

describe('validateSettings LLM fields', () => {
	it('returns defaults for empty input', () => {
		expect(validateSettings(null, defaultCatalog)).toEqual(DEFAULT_SETTINGS);
		expect(validateSettings(undefined, defaultCatalog)).toEqual(DEFAULT_SETTINGS);
	});

	it('merges known LLM fields from flat legacy input', () => {
		expect(
			validateSettings(
				{
					cursorCliPath: '/opt/cursor',
					llmModel: 'claude-opus-4-7-medium',
					timeoutSeconds: 120,
					prepareSingleCallMaxChars: 50000,
					prepareSingleCallMaxLines: 500
				},
				defaultCatalog
			)
		).toEqual({
			...DEFAULT_SETTINGS,
			ai: {
				...DEFAULT_SETTINGS.ai,
				cursorCliPath: '/opt/cursor',
				llmModel: 'claude-opus-4-7-medium',
				timeoutSeconds: 120,
				prepareSingleCallMaxChars: 50000,
				prepareSingleCallMaxLines: 500
			}
		});
	});

	it('normalizes unknown model id to catalog default', () => {
		const result = validateSettings({ llmModel: 'not-a-real-model' }, defaultCatalog);
		expect(result.ai.llmModel).toBe(defaultCatalog.defaultModelId);
	});

	it('clamps timeout below minimum to default', () => {
		expect(validateSettings({ timeoutSeconds: 10 }, defaultCatalog).ai.timeoutSeconds).toBe(
			DEFAULT_SETTINGS.ai.timeoutSeconds
		);
		expect(
			validateSettings({ timeoutSeconds: MIN_TIMEOUT_SECONDS - 1 }, defaultCatalog).ai.timeoutSeconds
		).toBe(DEFAULT_SETTINGS.ai.timeoutSeconds);
		expect(validateSettings({ timeoutSeconds: MIN_TIMEOUT_SECONDS }, defaultCatalog).ai.timeoutSeconds).toBe(
			MIN_TIMEOUT_SECONDS
		);
	});

	it('falls back batch thresholds when below minimum', () => {
		expect(
			validateSettings({ prepareSingleCallMaxChars: 100 }, defaultCatalog).ai.prepareSingleCallMaxChars
		).toBe(DEFAULT_SETTINGS.ai.prepareSingleCallMaxChars);
		expect(
			validateSettings({ prepareSingleCallMaxLines: 10 }, defaultCatalog).ai.prepareSingleCallMaxLines
		).toBe(DEFAULT_SETTINGS.ai.prepareSingleCallMaxLines);
	});

	it('accepts batch thresholds at minimum', () => {
		expect(
			validateSettings(
				{
					prepareSingleCallMaxChars: MIN_PREPARE_SINGLE_CALL_MAX_CHARS,
					prepareSingleCallMaxLines: MIN_PREPARE_SINGLE_CALL_MAX_LINES
				},
				defaultCatalog
			)
		).toEqual({
			...DEFAULT_SETTINGS,
			ai: {
				...DEFAULT_SETTINGS.ai,
				prepareSingleCallMaxChars: MIN_PREPARE_SINGLE_CALL_MAX_CHARS,
				prepareSingleCallMaxLines: MIN_PREPARE_SINGLE_CALL_MAX_LINES
			}
		});
	});

	it('preserves RSVP field validation', () => {
		expect(validateSettings({ wpm: 99999, chunkSize: 0 }, defaultCatalog).reader.wpm).toBe(5000);
		expect(validateSettings({ wpm: 99999, chunkSize: 0 }, defaultCatalog).reader.chunkSize).toBe(1);
	});
});
