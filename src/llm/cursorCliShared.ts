import type { AiSettings, SpeedReaderAiSettings } from '../types';

export type CursorCliSettingsSlice = Pick<
	AiSettings,
	'cursorCliPath' | 'timeoutSeconds' | 'llmModel'
>;

export interface CursorCliOptions {
	cursorCliPath?: string;
	model?: string | null;
	timeoutSeconds?: number;
}

/** Build CLI options from plugin settings (shared by prepare pipeline and settings smoke test). */
export function cursorCliOptionsFromSettings(
	settings: SpeedReaderAiSettings | CursorCliSettingsSlice
): CursorCliOptions {
	const ai = 'ai' in settings ? settings.ai : settings;
	const path = ai.cursorCliPath.trim();
	return {
		cursorCliPath: path.length ? path : undefined,
		model: ai.llmModel,
		timeoutSeconds: ai.timeoutSeconds
	};
}

export class CursorCliExecutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CursorCliExecutionError';
	}
}

function basename(path: string): string {
	const normalized = path.replace(/\\/g, '/');
	const index = normalized.lastIndexOf('/');
	return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function shouldPrependAgentSubcommand(executable: string): boolean {
	const forced = (process.env.CURSOR_CLI_PREFIX_AGENT_SUBCMD ?? '').trim();
	if (forced === '1') {
		return true;
	}
	if (forced === '0') {
		return false;
	}
	return basename(executable).toLowerCase() === 'cursor';
}

export function buildCursorCliArgv(
	executable: string,
	combinedPrompt: string,
	model: string | null | undefined
): string[] {
	const argv: string[] = [executable];
	if (shouldPrependAgentSubcommand(executable)) {
		argv.push('agent');
	}
	argv.push(
		'--print',
		'--trust',
		'--output-format',
		'text',
		'--sandbox',
		'disabled'
	);
	if (model && model.trim()) {
		argv.push('--model', model.trim());
	}
	const wd = (process.env.CURSOR_CLI_WORKSPACE ?? '').trim();
	if (wd) {
		argv.push('--workspace', wd);
	}
	argv.push(combinedPrompt);
	return argv;
}

export function combinePrompts(systemPrompt: string, userPrompt: string): string {
	return (
		'### System prompt\n\n' +
		systemPrompt.trim() +
		'\n\n### User task\n\n' +
		userPrompt.trim() +
		'\n'
	);
}

/** Minimal prompts used by Settings → Test Cursor CLI connection. */
export const CURSOR_CLI_SMOKE_PROMPTS = {
	system:
		'You are a CLI connectivity check. Follow the user\'s output format literally. Be brief.',
	user:
		'Respond with exactly one line containing only this token (no punctuation, no code fences): SPEED_READER_PING_OK'
} as const;

/** Caps timeout when running a connectivity LLM smoke test from Settings. */
export function clampCursorCliSmokeTimeoutSeconds(
	userTimeoutSeconds: number,
	ceiling = 120,
	floor = 30
): number {
	const u = Number.isFinite(userTimeoutSeconds)
		? Math.max(1, Math.floor(userTimeoutSeconds))
		: 300;
	return Math.min(ceiling, Math.max(floor, u));
}
