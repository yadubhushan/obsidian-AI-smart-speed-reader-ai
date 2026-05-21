import { Platform } from 'obsidian';
import { execFileSync, spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { LlmClient } from './LlmClient';
import {
	buildCursorCliArgv,
	clampCursorCliSmokeTimeoutSeconds,
	combinePrompts,
	CURSOR_CLI_SMOKE_PROMPTS,
	CursorCliExecutionError,
	cursorCliOptionsFromSettings,
	type CursorCliOptions,
	type CursorCliSettingsSlice
} from './cursorCliShared';

export type { LlmClient } from './LlmClient';
export {
	buildCursorCliArgv,
	clampCursorCliSmokeTimeoutSeconds,
	combinePrompts,
	CURSOR_CLI_SMOKE_PROMPTS,
	CursorCliExecutionError,
	cursorCliOptionsFromSettings,
	type CursorCliOptions,
	type CursorCliSettingsSlice
};

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

export type CursorCliClientDeps = NonNullable<
	ConstructorParameters<typeof CursorCliClient>[1]
>;

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
