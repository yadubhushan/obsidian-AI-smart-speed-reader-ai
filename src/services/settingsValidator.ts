import {
	DEFAULT_SETTINGS,
	PlaybackMode,
	READER_FONT_OPTIONS,
	SpeedReaderAiSettings,
	type ApiProviderPreset,
	type LlmBackend,
	type ReaderColorScheme,
	type ReaderFontOption
} from '../types';
import type { LlmModelCatalog } from '../llm/llmModelCatalog';
import { createDefaultLlmModelCatalog } from '../llm/llmModelCatalog';

export const MIN_TIMEOUT_SECONDS = 30;
export const MIN_PREPARE_SINGLE_CALL_MAX_CHARS = 1000;
export const MIN_PREPARE_SINGLE_CALL_MAX_LINES = 100;

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && !Number.isNaN(value)) {
		return value;
	}
	return fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === 'boolean') {
		return value;
	}
	return fallback;
}

function toString(value: unknown, fallback: string): string {
	if (typeof value === 'string') {
		return value;
	}
	return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePlaybackMode(value: unknown): PlaybackMode {
	return value === 'lineRepeat' ? 'lineRepeat' : 'rsvp';
}

function normalizeColorScheme(value: unknown): ReaderColorScheme {
	if (value === 'light' || value === 'auto') {
		return value;
	}
	return 'dark';
}

function normalizeFont(value: unknown): ReaderFontOption {
	const raw = toString(value, DEFAULT_SETTINGS.reader.font);
	if ((READER_FONT_OPTIONS as readonly string[]).includes(raw)) {
		return raw as ReaderFontOption;
	}
	return DEFAULT_SETTINGS.reader.font;
}

function normalizeBookBookmarkTemplate(value: unknown): string {
	const raw = toString(value, DEFAULT_SETTINGS.bookmarks.bookBookmarkNoteTemplate).trim();
	if (!raw.includes('{book_name}')) {
		return DEFAULT_SETTINGS.bookmarks.bookBookmarkNoteTemplate;
	}
	return raw;
}

function normalizeNoteBookmarkHeading(value: unknown): string {
	const raw = toString(value, DEFAULT_SETTINGS.bookmarks.noteBookmarkSectionHeading).trim();
	return raw || DEFAULT_SETTINGS.bookmarks.noteBookmarkSectionHeading;
}

function normalizeTimeoutSeconds(value: unknown): number {
	const n = Math.floor(toNumber(value, DEFAULT_SETTINGS.ai.timeoutSeconds));
	if (!Number.isFinite(n) || n < MIN_TIMEOUT_SECONDS) {
		return DEFAULT_SETTINGS.ai.timeoutSeconds;
	}
	return n;
}

function normalizePrepareSingleCallMaxChars(value: unknown): number {
	const n = Math.floor(toNumber(value, DEFAULT_SETTINGS.ai.prepareSingleCallMaxChars));
	if (!Number.isFinite(n) || n < MIN_PREPARE_SINGLE_CALL_MAX_CHARS) {
		return DEFAULT_SETTINGS.ai.prepareSingleCallMaxChars;
	}
	return n;
}

function normalizePrepareSingleCallMaxLines(value: unknown): number {
	const n = Math.floor(toNumber(value, DEFAULT_SETTINGS.ai.prepareSingleCallMaxLines));
	if (!Number.isFinite(n) || n < MIN_PREPARE_SINGLE_CALL_MAX_LINES) {
		return DEFAULT_SETTINGS.ai.prepareSingleCallMaxLines;
	}
	return n;
}

const LLM_BACKENDS: LlmBackend[] = ['auto', 'cursor-cli', 'ai-providers', 'openai-compatible'];
const API_PRESETS: ApiProviderPreset[] = ['openai', 'openrouter', 'custom'];

function normalizeLlmBackend(value: unknown): LlmBackend {
	if (typeof value === 'string' && (LLM_BACKENDS as string[]).includes(value)) {
		return value as LlmBackend;
	}
	return DEFAULT_SETTINGS.ai.llmBackend;
}

function normalizeApiProviderPreset(value: unknown): ApiProviderPreset {
	if (typeof value === 'string' && (API_PRESETS as string[]).includes(value)) {
		return value as ApiProviderPreset;
	}
	return DEFAULT_SETTINGS.ai.apiProviderPreset;
}

function pickFlat(raw: Record<string, unknown>, key: string): unknown {
	if (key in raw) {
		return raw[key];
	}
	return undefined;
}

function pickNested(raw: Record<string, unknown>, group: string, key: string): unknown {
	const g = raw[group];
	if (isRecord(g) && key in g) {
		return g[key];
	}
	return undefined;
}

function firstDefined(...values: unknown[]): unknown {
	for (const v of values) {
		if (v !== undefined) {
			return v;
		}
	}
	return undefined;
}

/** Detect legacy flat settings (pre nested schema). */
export function isFlatSettings(raw: unknown): boolean {
	if (!isRecord(raw)) {
		return false;
	}
	if ('reader' in raw || 'ai' in raw) {
		return false;
	}
	return 'wpm' in raw || 'llmBackend' in raw || 'fontSize' in raw;
}

/** Map legacy flat data.json into nested SpeedReaderAiSettings shape. */
export function migrateFlatSettings(raw: unknown): Partial<SpeedReaderAiSettings> {
	if (!isRecord(raw) || !isFlatSettings(raw)) {
		return raw as Partial<SpeedReaderAiSettings>;
	}

	return {
		reader: {
			font: normalizeFont(raw.font),
			fontSize: toNumber(raw.fontSize, DEFAULT_SETTINGS.reader.fontSize),
			wpm: toNumber(raw.wpm, DEFAULT_SETTINGS.reader.wpm),
			chunkSize: toNumber(raw.chunkSize, DEFAULT_SETTINGS.reader.chunkSize),
			colorScheme: normalizeColorScheme(raw.colorScheme ?? 'dark'),
			autoStart: isRecord(raw.autoStart)
				? {
						enabled: toBoolean(raw.autoStart.enabled, DEFAULT_SETTINGS.reader.autoStart.enabled),
						seconds: toNumber(raw.autoStart.seconds, DEFAULT_SETTINGS.reader.autoStart.seconds)
					}
				: { enabled: false, seconds: 3 },
			autoCloseOnCompletion: toBoolean(
				raw.autoCloseOnCompletion,
				DEFAULT_SETTINGS.reader.autoCloseOnCompletion
			),
			textOrientation: isRecord(raw.textOrientation)
				? {
						rtl: toBoolean(raw.textOrientation.rtl, DEFAULT_SETTINGS.reader.textOrientation.rtl),
						autoDetect: toBoolean(
							raw.textOrientation.autoDetect,
							DEFAULT_SETTINGS.reader.textOrientation.autoDetect
						)
					}
				: DEFAULT_SETTINGS.reader.textOrientation,
			display: {
				showRemainingTime: toBoolean(
					isRecord(raw.display) ? raw.display.showRemainingTime : raw.showStats,
					DEFAULT_SETTINGS.reader.display.showRemainingTime
				),
				showContext: toBoolean(raw.showContext, DEFAULT_SETTINGS.reader.display.showContext),
				showProgress: toBoolean(raw.showProgress, DEFAULT_SETTINGS.reader.display.showProgress)
			},
			defaultPlaybackMode: normalizePlaybackMode(raw.defaultPlaybackMode),
			lineRepeatGapMs: toNumber(raw.lineRepeatGapMs, DEFAULT_SETTINGS.reader.lineRepeatGapMs),
			enableMicropause: toBoolean(raw.enableMicropause, DEFAULT_SETTINGS.reader.enableMicropause),
			micropauseIntensity: toNumber(
				raw.micropauseIntensity,
				DEFAULT_SETTINGS.reader.micropauseIntensity
			),
			contextWords: toNumber(raw.contextWords, DEFAULT_SETTINGS.reader.contextWords)
		},
		ai: {
			llmBackend: normalizeLlmBackend(raw.llmBackend),
			aiProvidersProviderId: toString(
				raw.aiProvidersProviderId,
				DEFAULT_SETTINGS.ai.aiProvidersProviderId
			),
			apiProviderPreset: normalizeApiProviderPreset(raw.apiProviderPreset),
			apiKey: toString(raw.apiKey, DEFAULT_SETTINGS.ai.apiKey),
			apiBaseUrl: toString(raw.apiBaseUrl, DEFAULT_SETTINGS.ai.apiBaseUrl),
			apiModel: toString(raw.apiModel, DEFAULT_SETTINGS.ai.apiModel),
			cursorCliPath: toString(raw.cursorCliPath, DEFAULT_SETTINGS.ai.cursorCliPath),
			llmModel: toString(raw.llmModel, DEFAULT_SETTINGS.ai.llmModel),
			timeoutSeconds: toNumber(raw.timeoutSeconds, DEFAULT_SETTINGS.ai.timeoutSeconds),
			prepareSingleCallMaxChars: toNumber(
				raw.prepareSingleCallMaxChars,
				DEFAULT_SETTINGS.ai.prepareSingleCallMaxChars
			),
			prepareSingleCallMaxLines: toNumber(
				raw.prepareSingleCallMaxLines,
				DEFAULT_SETTINGS.ai.prepareSingleCallMaxLines
			)
		},
		bookmarks: {
			bookBookmarkNoteTemplate: toString(
				raw.bookBookmarkNoteTemplate,
				DEFAULT_SETTINGS.bookmarks.bookBookmarkNoteTemplate
			),
			noteBookmarkSectionHeading: toString(
				raw.noteBookmarkSectionHeading,
				DEFAULT_SETTINGS.bookmarks.noteBookmarkSectionHeading
			)
		},
		dictionary: {
			enableWordLookup: toBoolean(raw.enableWordLookup, DEFAULT_SETTINGS.dictionary.enableWordLookup),
			dictionaryCacheEnabled: toBoolean(
				raw.dictionaryCacheEnabled,
				DEFAULT_SETTINGS.dictionary.dictionaryCacheEnabled
			)
		}
	};
}

function normalizeReaderSettings(raw: unknown, flat: Record<string, unknown>): SpeedReaderAiSettings['reader'] {
	const r = isRecord(raw) ? raw : {};
	const displayRaw = isRecord(r.display) ? r.display : {};
	const autoStartRaw = isRecord(r.autoStart) ? r.autoStart : {};
	const orientationRaw = isRecord(r.textOrientation) ? r.textOrientation : {};

	return {
		font: normalizeFont(firstDefined(r.font, flat.font)),
		fontSize: clamp(
			Math.round(toNumber(firstDefined(r.fontSize, flat.fontSize), DEFAULT_SETTINGS.reader.fontSize)),
			24,
			200
		),
		wpm: clamp(
			Math.round(toNumber(firstDefined(r.wpm, flat.wpm), DEFAULT_SETTINGS.reader.wpm)),
			50,
			5000
		),
		chunkSize: clamp(
			Math.round(toNumber(firstDefined(r.chunkSize, flat.chunkSize), DEFAULT_SETTINGS.reader.chunkSize)),
			1,
			5
		),
		colorScheme: normalizeColorScheme(firstDefined(r.colorScheme, flat.colorScheme)),
		autoStart: {
			enabled: toBoolean(
				firstDefined(autoStartRaw.enabled, flat.autoStartEnabled),
				DEFAULT_SETTINGS.reader.autoStart.enabled
			),
			seconds: clamp(
				Math.round(
					toNumber(
						firstDefined(autoStartRaw.seconds, flat.autoStartSeconds),
						DEFAULT_SETTINGS.reader.autoStart.seconds
					)
				),
				1,
				60
			)
		},
		autoCloseOnCompletion: toBoolean(
			firstDefined(r.autoCloseOnCompletion, flat.autoCloseOnCompletion),
			DEFAULT_SETTINGS.reader.autoCloseOnCompletion
		),
		textOrientation: {
			rtl: toBoolean(
				firstDefined(orientationRaw.rtl, flat.rtl),
				DEFAULT_SETTINGS.reader.textOrientation.rtl
			),
			autoDetect: toBoolean(
				firstDefined(orientationRaw.autoDetect, flat.textOrientationAutoDetect),
				DEFAULT_SETTINGS.reader.textOrientation.autoDetect
			)
		},
		display: {
			showRemainingTime: toBoolean(
				firstDefined(displayRaw.showRemainingTime, flat.showStats, flat.showRemainingTime),
				DEFAULT_SETTINGS.reader.display.showRemainingTime
			),
			showContext: toBoolean(
				firstDefined(displayRaw.showContext, flat.showContext),
				DEFAULT_SETTINGS.reader.display.showContext
			),
			showProgress: toBoolean(
				firstDefined(displayRaw.showProgress, flat.showProgress),
				DEFAULT_SETTINGS.reader.display.showProgress
			)
		},
		defaultPlaybackMode: normalizePlaybackMode(
			firstDefined(r.defaultPlaybackMode, flat.defaultPlaybackMode)
		),
		lineRepeatGapMs: clamp(
			Math.round(
				toNumber(firstDefined(r.lineRepeatGapMs, flat.lineRepeatGapMs), DEFAULT_SETTINGS.reader.lineRepeatGapMs)
			),
			100,
			3000
		),
		enableMicropause: toBoolean(
			firstDefined(r.enableMicropause, flat.enableMicropause),
			DEFAULT_SETTINGS.reader.enableMicropause
		),
		micropauseIntensity: clamp(
			toNumber(firstDefined(r.micropauseIntensity, flat.micropauseIntensity), DEFAULT_SETTINGS.reader.micropauseIntensity),
			1,
			3
		),
		contextWords: clamp(
			Math.round(toNumber(firstDefined(r.contextWords, flat.contextWords), DEFAULT_SETTINGS.reader.contextWords)),
			1,
			20
		)
	};
}

function normalizeAiSettings(
	raw: unknown,
	flat: Record<string, unknown>,
	catalog: LlmModelCatalog
): SpeedReaderAiSettings['ai'] {
	const a = isRecord(raw) ? raw : {};
	return {
		llmBackend: normalizeLlmBackend(firstDefined(a.llmBackend, flat.llmBackend)),
		aiProvidersProviderId: toString(
			firstDefined(a.aiProvidersProviderId, flat.aiProvidersProviderId),
			DEFAULT_SETTINGS.ai.aiProvidersProviderId
		).trim(),
		apiProviderPreset: normalizeApiProviderPreset(
			firstDefined(a.apiProviderPreset, flat.apiProviderPreset)
		),
		apiKey: toString(firstDefined(a.apiKey, flat.apiKey), DEFAULT_SETTINGS.ai.apiKey),
		apiBaseUrl: toString(firstDefined(a.apiBaseUrl, flat.apiBaseUrl), DEFAULT_SETTINGS.ai.apiBaseUrl).trim(),
		apiModel: toString(firstDefined(a.apiModel, flat.apiModel), DEFAULT_SETTINGS.ai.apiModel).trim(),
		cursorCliPath: toString(
			firstDefined(a.cursorCliPath, flat.cursorCliPath),
			DEFAULT_SETTINGS.ai.cursorCliPath
		).trim(),
		llmModel: catalog.normalize(
			toString(firstDefined(a.llmModel, flat.llmModel), DEFAULT_SETTINGS.ai.llmModel)
		),
		timeoutSeconds: normalizeTimeoutSeconds(firstDefined(a.timeoutSeconds, flat.timeoutSeconds)),
		prepareSingleCallMaxChars: normalizePrepareSingleCallMaxChars(
			firstDefined(a.prepareSingleCallMaxChars, flat.prepareSingleCallMaxChars)
		),
		prepareSingleCallMaxLines: normalizePrepareSingleCallMaxLines(
			firstDefined(a.prepareSingleCallMaxLines, flat.prepareSingleCallMaxLines)
		)
	};
}

export function validateSettings(
	raw: Partial<SpeedReaderAiSettings> | null | undefined,
	catalog: LlmModelCatalog = createDefaultLlmModelCatalog()
): SpeedReaderAiSettings {
	const migrated = migrateFlatSettings(raw ?? {});
	const input = isRecord(raw) ? raw : {};
	const flat = isFlatSettings(raw) ? (raw as Record<string, unknown>) : input;

	const readerRaw = isRecord(migrated.reader)
		? migrated.reader
		: pickNested(input, 'reader', 'font') !== undefined || 'reader' in input
			? input.reader
			: undefined;

	const aiRaw = isRecord(migrated.ai) ? migrated.ai : 'ai' in input ? input.ai : undefined;

	const flatRecord = flat as Record<string, unknown>;

	return {
		reader: normalizeReaderSettings(readerRaw, flat),
		ai: normalizeAiSettings(aiRaw, flat, catalog),
		bookmarks: {
			bookBookmarkNoteTemplate: normalizeBookBookmarkTemplate(
				firstDefined(
					pickNested(input, 'bookmarks', 'bookBookmarkNoteTemplate'),
					isRecord(migrated.bookmarks) ? migrated.bookmarks.bookBookmarkNoteTemplate : undefined,
					flatRecord.bookBookmarkNoteTemplate
				)
			),
			noteBookmarkSectionHeading: normalizeNoteBookmarkHeading(
				firstDefined(
					pickNested(input, 'bookmarks', 'noteBookmarkSectionHeading'),
					isRecord(migrated.bookmarks) ? migrated.bookmarks.noteBookmarkSectionHeading : undefined,
					flatRecord.noteBookmarkSectionHeading
				)
			)
		},
		dictionary: {
			enableWordLookup: toBoolean(
				firstDefined(
					pickNested(input, 'dictionary', 'enableWordLookup'),
					isRecord(migrated.dictionary) ? migrated.dictionary.enableWordLookup : undefined,
					flatRecord.enableWordLookup
				),
				DEFAULT_SETTINGS.dictionary.enableWordLookup
			),
			dictionaryCacheEnabled: toBoolean(
				firstDefined(
					pickNested(input, 'dictionary', 'dictionaryCacheEnabled'),
					isRecord(migrated.dictionary) ? migrated.dictionary.dictionaryCacheEnabled : undefined,
					flatRecord.dictionaryCacheEnabled
				),
				DEFAULT_SETTINGS.dictionary.dictionaryCacheEnabled
			)
		}
	};
}

export function parseTimeoutSecondsFromInput(raw: string): number | null {
	const n = Number.parseInt(raw.trim(), 10);
	if (!Number.isFinite(n) || n < MIN_TIMEOUT_SECONDS) {
		return null;
	}
	return n;
}

export function parsePrepareSingleCallMaxCharsFromInput(raw: string): number | null {
	const n = Number.parseInt(raw.trim(), 10);
	if (!Number.isFinite(n) || n < MIN_PREPARE_SINGLE_CALL_MAX_CHARS) {
		return null;
	}
	return n;
}

export function parsePrepareSingleCallMaxLinesFromInput(raw: string): number | null {
	const n = Number.parseInt(raw.trim(), 10);
	if (!Number.isFinite(n) || n < MIN_PREPARE_SINGLE_CALL_MAX_LINES) {
		return null;
	}
	return n;
}
