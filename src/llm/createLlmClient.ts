import { Platform } from 'obsidian';
import type { LlmBackend, SpeedReaderAiSettings } from '../types';
import type { AiProvidersExecuteApi } from './AiProvidersLlmClient';
import { AiProvidersLlmClient } from './AiProvidersLlmClient';
import { canResolveCursorCliDesktop } from './cursorCliDesktopBridge';
import { cursorCliOptionsFromSettings } from './cursorCliShared';
import type { LlmClient } from './LlmClient';
import { LlmClientError } from './LlmClient';
import { OpenAiCompatibleClient, resolveApiBaseUrl } from './OpenAiCompatibleClient';

export type { LlmBackend };

export interface CreateLlmClientDeps {
	getSettings: () => SpeedReaderAiSettings;
	getAiProviders?: () => Promise<AiProvidersExecuteApi | null>;
	isDesktopApp?: boolean;
	canResolveCursorCli?: (configuredPath: string | undefined) => boolean;
}

function defaultCanResolveCursorCli(configuredPath: string | undefined): boolean {
	if (Platform.isDesktopApp === false) {
		return false;
	}
	return canResolveCursorCliDesktop(configuredPath);
}

function hasApiKeyConfigured(settings: SpeedReaderAiSettings): boolean {
	return settings.ai.apiKey.trim().length > 0 && settings.ai.apiModel.trim().length > 0;
}

function hasAiProvidersConfigured(settings: SpeedReaderAiSettings): boolean {
	return settings.ai.aiProvidersProviderId.trim().length > 0;
}

class LazyCursorCliLlmClient implements LlmClient {
	private client: LlmClient | null = null;

	constructor(private readonly getSettings: () => SpeedReaderAiSettings) {}

	complete(systemPrompt: string, userPrompt: string): Promise<string> {
		if (this.client) {
			return this.client.complete(systemPrompt, userPrompt);
		}
		return import('./CursorCliClient').then(({ CursorCliClient }) => {
			this.client = new CursorCliClient(cursorCliOptionsFromSettings(this.getSettings()));
			return this.client.complete(systemPrompt, userPrompt);
		});
	}
}

function createAiProvidersClient(
	settings: SpeedReaderAiSettings,
	getAiProviders: () => Promise<AiProvidersExecuteApi | null>
): LlmClient {
	return new AiProvidersLlmClient({
		providerId: settings.ai.aiProvidersProviderId,
		modelOverride: settings.ai.llmModel,
		timeoutSeconds: settings.ai.timeoutSeconds,
		getAiProviders
	});
}

function createOpenAiCompatibleClient(settings: SpeedReaderAiSettings): LlmClient {
	const baseUrl = resolveApiBaseUrl(settings.ai.apiProviderPreset, settings.ai.apiBaseUrl);
	return new OpenAiCompatibleClient({
		apiKey: settings.ai.apiKey,
		model: settings.ai.apiModel,
		baseUrl,
		preset: settings.ai.apiProviderPreset,
		timeoutSeconds: settings.ai.timeoutSeconds
	});
}

export function resolveAutoBackend(
	settings: SpeedReaderAiSettings,
	deps: Pick<CreateLlmClientDeps, 'isDesktopApp' | 'canResolveCursorCli'>
): Exclude<LlmBackend, 'auto'> {
	const isDesktop = deps.isDesktopApp ?? Platform.isDesktopApp;
	const canResolveCursor = isDesktop
		? (deps.canResolveCursorCli?.(settings.ai.cursorCliPath.trim() || undefined) ??
			defaultCanResolveCursorCli(settings.ai.cursorCliPath.trim() || undefined))
		: false;

	if (isDesktop && canResolveCursor) {
		return 'cursor-cli';
	}
	if (hasAiProvidersConfigured(settings)) {
		return 'ai-providers';
	}
	if (hasApiKeyConfigured(settings)) {
		return 'openai-compatible';
	}

	throw new LlmClientError(
		isDesktop
			? 'No LLM backend configured. Open Settings → Community plugins → Speed Reader AI and configure AI.'
			: 'No LLM backend configured for mobile. Open Settings → Community plugins → Speed Reader AI and configure AI.'
	);
}

export function createLlmClient(deps: CreateLlmClientDeps): LlmClient {
	const settings = deps.getSettings();
	const backend =
		settings.ai.llmBackend === 'auto'
			? resolveAutoBackend(settings, deps)
			: settings.ai.llmBackend;

	const getAiProviders =
		deps.getAiProviders ??
		(async () => {
			throw new LlmClientError('AI Providers integration is not initialized.');
		});

	switch (backend) {
		case 'cursor-cli': {
			if (!(deps.isDesktopApp ?? Platform.isDesktopApp)) {
				throw new LlmClientError('Cursor CLI is not available on mobile.');
			}
			return new LazyCursorCliLlmClient(deps.getSettings);
		}
		case 'ai-providers':
			if (!hasAiProvidersConfigured(settings)) {
				throw new LlmClientError('Select an AI Providers entry in Speed Reader preferences.');
			}
			return createAiProvidersClient(settings, getAiProviders);
		case 'openai-compatible':
			if (!hasApiKeyConfigured(settings)) {
				throw new LlmClientError('API key and model are required in Speed Reader preferences.');
			}
			return createOpenAiCompatibleClient(settings);
		default:
			throw new LlmClientError(`Unknown LLM backend: ${String(backend)}`);
	}
}

/** Reads current settings on each call so backend changes apply without recreating clients. */
export class SettingsBackedLlmClient implements LlmClient {
	constructor(private readonly deps: CreateLlmClientDeps) {}

	complete(systemPrompt: string, userPrompt: string): Promise<string> {
		return createLlmClient(this.deps).complete(systemPrompt, userPrompt);
	}
}

export function describeActiveLlmBackend(settings: SpeedReaderAiSettings): string {
	if (settings.ai.llmBackend !== 'auto') {
		return settings.ai.llmBackend;
	}
	try {
		return `auto (${resolveAutoBackend(settings, {})})`;
	} catch {
		return 'auto (unconfigured)';
	}
}

export function isLlmBackendConfigured(
	settings: SpeedReaderAiSettings,
	deps?: Pick<CreateLlmClientDeps, 'isDesktopApp' | 'canResolveCursorCli'>
): boolean {
	if (settings.ai.llmBackend === 'cursor-cli') {
		const isDesktop = deps?.isDesktopApp ?? Platform.isDesktopApp;
		if (!isDesktop) {
			return false;
		}
		return (
			isDesktop &&
			(deps?.canResolveCursorCli?.(settings.ai.cursorCliPath.trim() || undefined) ??
				defaultCanResolveCursorCli(settings.ai.cursorCliPath.trim() || undefined))
		);
	}
	if (settings.ai.llmBackend === 'ai-providers') {
		return hasAiProvidersConfigured(settings);
	}
	if (settings.ai.llmBackend === 'openai-compatible') {
		return hasApiKeyConfigured(settings);
	}
	try {
		resolveAutoBackend(settings, deps ?? {});
		return true;
	} catch {
		return false;
	}
}
