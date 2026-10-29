import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types';
import {
	MIN_PREPARE_SINGLE_CALL_MAX_CHARS,
	MIN_PREPARE_SINGLE_CALL_MAX_LINES,
	MIN_TIMEOUT_SECONDS,
	validateSettings
} from '../src/services/settingsValidator';


describe('validateSettings LLM fields', () => {
	it('returns defaults for empty input', () => {
		expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it('merges known LLM fields from flat legacy input', () => {
		expect(
			validateSettings({
				aiProvidersProviderId: 'p1',
				aiProvidersModelOverride: 'gpt-4o-mini',
				timeoutSeconds: 120,
				prepareSingleCallMaxChars: 50000,
				prepareSingleCallMaxLines: 500
			} as never)
		).toEqual({
			...DEFAULT_SETTINGS,
			ai: {
				...DEFAULT_SETTINGS.ai,
				aiProvidersProviderId: 'p1',
				aiProvidersModelOverride: 'gpt-4o-mini',
				timeoutSeconds: 120,
				prepareSingleCallMaxChars: 50000,
				prepareSingleCallMaxLines: 500
			}
		});
	});

	it('drops removed backend fields (Cursor CLI, API key) from saved data', () => {
		const result = validateSettings({
			ai: {
				...DEFAULT_SETTINGS.ai,
				llmBackend: 'cursor-cli',
				cursorCliPath: '/opt/cursor',
				apiKey: 'sk-secret',
				llmModel: 'composer-2.5-fast'
			}
		} as never);
		expect(result.ai).toEqual(DEFAULT_SETTINGS.ai);
		expect(JSON.stringify(result)).not.toContain('sk-secret');
	});

	it('clamps timeout below minimum to default', () => {
		expect(validateSettings({ timeoutSeconds: 10 }).ai.timeoutSeconds).toBe(
			DEFAULT_SETTINGS.ai.timeoutSeconds
		);
		expect(
			validateSettings({ timeoutSeconds: MIN_TIMEOUT_SECONDS - 1 }).ai.timeoutSeconds
		).toBe(DEFAULT_SETTINGS.ai.timeoutSeconds);
		expect(validateSettings({ timeoutSeconds: MIN_TIMEOUT_SECONDS }).ai.timeoutSeconds).toBe(
			MIN_TIMEOUT_SECONDS
		);
	});

	it('falls back batch thresholds when below minimum', () => {
		expect(
			validateSettings({ prepareSingleCallMaxChars: 100 }).ai.prepareSingleCallMaxChars
		).toBe(DEFAULT_SETTINGS.ai.prepareSingleCallMaxChars);
		expect(
			validateSettings({ prepareSingleCallMaxLines: 10 }).ai.prepareSingleCallMaxLines
		).toBe(DEFAULT_SETTINGS.ai.prepareSingleCallMaxLines);
	});

	it('accepts batch thresholds at minimum', () => {
		expect(
			validateSettings(
				{
					prepareSingleCallMaxChars: MIN_PREPARE_SINGLE_CALL_MAX_CHARS,
					prepareSingleCallMaxLines: MIN_PREPARE_SINGLE_CALL_MAX_LINES
				}
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
		expect(validateSettings({ wpm: 99999, chunkSize: 0 }).reader.wpm).toBe(5000);
		expect(validateSettings({ wpm: 99999, chunkSize: 0 }).reader.chunkSize).toBe(1);
	});
});
