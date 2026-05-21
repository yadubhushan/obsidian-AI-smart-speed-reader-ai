import { Platform } from 'obsidian';
import { execFileSync, spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { basename, resolve } from 'path';
import type { AiSettings, SpeedReaderAiSettings } from '../types';
import type { LlmClient } from './LlmClient';

export type { LlmClient } from './LlmClient';

export type CursorCliSettingsSlice = Pick<
	AiSettings,
	'cursorCliPath' | 'timeoutSeconds' | 'llmModel'
>;

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

function which(cmd: string): string | null {
	try {
		const isWin = process.platform === 'win32';
		if (isWin) {
			const out = execFileSync('where', [cmd], { encoding: 'utf8' });
			const bin = out.split(/\r?\n/)[0]?.trim();
			return bin || null;
		}
		const out = execFileSync('which', [cmd], { encoding: 'utf8' }).trim();
		return out || null;
	} catch {
		return null;
	}
}

/** Match Python `_detect_cursor_executable` */
export function detectCursorExecutable(configuredPath: string | undefined): string {
	if (Platform.isDesktopApp === false) {
		throw new CursorCliExecutionError('Cursor CLI is not available on mobile.');
	}
	const raw = (configuredPath ?? '').trim();
	if (raw) {
		const home = process.env.HOME ?? '';
		const expanded = raw.replace(/^~(?=$|[/\\])/, home);
		if (existsSync(expanded)) {
			return resolve(expanded);
		}
		const hit = which(raw);
		if (hit) {
			return hit;
		}
	}

	for (const name of ['cursor-agent', 'cursor']) {
		const hit = which(name);
		if (hit) {
			return hit;
		}
	}

	throw new CursorCliExecutionError(
		'Could not find Cursor CLI executable. Install Cursor Agent CLI ' +
			'or set cursorCliPath in plugin settings.'
	);
}

export interface CursorCliOptions {
	cursorCliPath?: string;
	model?: string | null;
	timeoutSeconds?: number;
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

type SpawnLike = (
	command: string,
	args: readonly string[],
	options: { windowsHide?: boolean }
) => ChildProcess;

/** Runs Cursor Agent non-interactively (`cursor agent --print …` when basename is `cursor`). */
export class CursorCliClient implements LlmClient {
	private readonly cursorCliPath: string;
	private readonly model: string | null | undefined;
	private readonly timeoutMs: number;
	private readonly spawnImpl: SpawnLike;
	private readonly resolveExecutableImpl: () => string;

	constructor(
		options: CursorCliOptions = {},
		deps: {
			spawnImpl?: SpawnLike;
			/** Test hook: bypass filesystem / PATH detection */
			resolveExecutable?: () => string;
		} = {}
	) {
		this.spawnImpl = deps.spawnImpl ?? spawn;
		this.cursorCliPath = options.cursorCliPath ?? '';
		this.model = options.model;
		this.timeoutMs = Math.max(1, (options.timeoutSeconds ?? 300) * 1000);
		const path = this.cursorCliPath.trim();
		this.resolveExecutableImpl =
			deps.resolveExecutable ??
			(() => detectCursorExecutable(path || undefined));
	}

	private resolveExecutable(): string {
		return this.resolveExecutableImpl();
	}

	complete(systemPrompt: string, userPrompt: string): Promise<string> {
		const combined = combinePrompts(systemPrompt, userPrompt);
		const exe = this.resolveExecutable();
		const argv = buildCursorCliArgv(exe, combined, this.model);
		const command = argv[0];
		if (!command) {
			return Promise.reject(new CursorCliExecutionError('Cursor CLI executable missing.'));
		}

		return new Promise((resolvePromise, reject) => {
			const child = this.spawnImpl(command, argv.slice(1), {
				windowsHide: true
			});

			const outAcc = { s: '' };
			const errAcc = { s: '' };
			const onData = (buf: Buffer, acc: { s: string }) => {
				acc.s += buf.toString('utf8');
			};
			child.stdout?.on('data', (c: Buffer) => onData(c, outAcc));
			child.stderr?.on('data', (c: Buffer) => onData(c, errAcc));

			const timer = setTimeout(() => {
				child.kill('SIGTERM');
				reject(new CursorCliExecutionError('Cursor CLI timed out.'));
			}, this.timeoutMs);

			child.on('error', (err: Error) => {
				clearTimeout(timer);
				reject(err);
			});

			child.on('close', (code: number | null) => {
				clearTimeout(timer);
				const stdout = outAcc.s.trim();
				const stderr = errAcc.s.trim();
				void stderr;
				if (code !== 0) {
					reject(
						new CursorCliExecutionError(`Cursor CLI failed (exit=${code}).`)
					);
					return;
				}
				if (!stdout) {
					reject(
						new CursorCliExecutionError(
							'Cursor CLI returned empty output (unexpected for --print).'
						)
					);
					return;
				}
				resolvePromise(stdout);
			});
		});
	}
}

/** Minimal prompts used by Settings → Test Cursor CLI connection. */
export const CURSOR_CLI_SMOKE_PROMPTS = {
	system:
		'You are a CLI connectivity check. Follow the user\'s output format literally. Be brief.',
	user:
		'Respond with exactly one line containing only this token (no punctuation, no code fences): SPEED_READER_PING_OK'
} as const;

export type CursorCliClientDeps = NonNullable<
	ConstructorParameters<typeof CursorCliClient>[1]
>;

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

/**
 * Runs one real `complete()` through the Cursor CLI (same spawn path as prepare).
 */
export async function runCursorCliSmokeTest(
	options: CursorCliOptions,
	ceilingSeconds = 120,
	deps?: CursorCliClientDeps
): Promise<
	| { ok: true; stdout: string; timeoutSecondsUsed: number }
	| { ok: false; message: string }
> {
	const timeoutSecondsUsed = clampCursorCliSmokeTimeoutSeconds(
		options.timeoutSeconds ?? 300,
		ceilingSeconds
	);
	const client = new CursorCliClient(
		{
			cursorCliPath: options.cursorCliPath,
			model: options.model,
			timeoutSeconds: timeoutSecondsUsed
		},
		deps ?? {}
	);
	try {
		const stdout = await client.complete(
			CURSOR_CLI_SMOKE_PROMPTS.system,
			CURSOR_CLI_SMOKE_PROMPTS.user
		);
		return { ok: true, stdout, timeoutSecondsUsed };
	} catch (e: unknown) {
		const message =
			e instanceof Error
				? e.message
				: `Cursor CLI smoke test failed: ${String(e)}`;
		return { ok: false, message };
	}
}
