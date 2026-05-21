import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	buildCursorCliArgv,
	clampCursorCliSmokeTimeoutSeconds,
	combinePrompts,
	CursorCliClient,
	CursorCliExecutionError,
	runCursorCliSmokeTest
} from '../src/llm/CursorCliClient';

describe('combinePrompts', () => {
	it('wraps system and user sections', () => {
		expect(combinePrompts(' S ', ' U ')).toBe(
			'### System prompt\n\nS\n\n### User task\n\nU\n'
		);
	});
});

describe('buildCursorCliArgv', () => {
	beforeEach(() => {
		delete process.env.CURSOR_CLI_PREFIX_AGENT_SUBCMD;
		delete process.env.CURSOR_CLI_WORKSPACE;
	});

	it('inserts agent when basename is cursor', () => {
		const argv = buildCursorCliArgv('/x/cursor', 'PROMPT', null);
		expect(argv[0]).toBe('/x/cursor');
		expect(argv[1]).toBe('agent');
		expect(argv).toContain('--print');
		expect(argv).toContain('text');
		expect(argv[argv.length - 1]).toBe('PROMPT');
	});

	it('omits agent for cursor-agent binary', () => {
		const argv = buildCursorCliArgv('/y/cursor-agent', 'P', null);
		expect(argv[1]).not.toBe('agent');
		expect(argv).toContain('--print');
	});

	it('respects CURSOR_CLI_PREFIX_AGENT_SUBCMD=1', () => {
		process.env.CURSOR_CLI_PREFIX_AGENT_SUBCMD = '1';
		const argv = buildCursorCliArgv('/y/cursor-agent', 'P', null);
		expect(argv[1]).toBe('agent');
	});

	it('adds --model when set', () => {
		const argv = buildCursorCliArgv('/y/cursor-agent', 'P', 'gpt-4');
		const i = argv.indexOf('--model');
		expect(i).toBeGreaterThan(-1);
		expect(argv[i + 1]).toBe('gpt-4');
	});

	it('adds --workspace when env set', () => {
		try {
			process.env.CURSOR_CLI_WORKSPACE = '/tmp/ws';
			const argv = buildCursorCliArgv('/y/cursor-agent', 'P', null);
			const i = argv.indexOf('--workspace');
			expect(i).toBeGreaterThan(-1);
			expect(argv[i + 1]).toBe('/tmp/ws');
		} finally {
			delete process.env.CURSOR_CLI_WORKSPACE;
		}
	});
});

function mockSpawnSequence(
	sequences: Array<{
		code: number | null;
		stdout?: string;
		stderr?: string;
	}>
) {
	let i = 0;
	return vi.fn(() => {
		const spec = sequences[i++] ?? { code: 1, stdout: '', stderr: '' };
		const ee = new EventEmitter() as import('node:child_process').ChildProcess;
		const stdout = new EventEmitter();
		const stderr = new EventEmitter();
		(ee as unknown as { stdout: typeof stdout }).stdout = stdout;
		(ee as unknown as { stderr: typeof stderr }).stderr = stderr;
		queueMicrotask(() => {
			if (spec.stdout) {
				stdout.emit('data', Buffer.from(spec.stdout));
			}
			if (spec.stderr) {
				stderr.emit('data', Buffer.from(spec.stderr));
			}
			ee.emit('close', spec.code);
		});
		return ee;
	});
}

describe('CursorCliClient.complete (mocked spawn)', () => {
	it('resolves trimmed stdout on success', async () => {
		const spawnImpl = mockSpawnSequence([{ code: 0, stdout: '  ok \n' }]);
		const client = new CursorCliClient(
			{ cursorCliPath: '', timeoutSeconds: 60 },
			{
				spawnImpl,
				resolveExecutable: () => '/bin/cursor-agent'
			}
		);
		await expect(client.complete('sys', 'usr')).resolves.toBe('ok');
		expect(spawnImpl).toHaveBeenCalledTimes(1);
		const [cmd, args] = spawnImpl.mock.calls[0];
		expect(cmd).toBe('/bin/cursor-agent');
		expect(args[0]).not.toBe('agent');
	});

	it('rejects on non-zero exit', async () => {
		const spawnImpl = mockSpawnSequence([{ code: 1, stdout: 'x' }]);
		const client = new CursorCliClient(
			{ cursorCliPath: '' },
			{ spawnImpl, resolveExecutable: () => '/bin/cursor-agent' }
		);
		await expect(client.complete('a', 'b')).rejects.toThrow(CursorCliExecutionError);
	});

	it('rejects on empty stdout', async () => {
		const spawnImpl = mockSpawnSequence([{ code: 0, stdout: '' }]);
		const client = new CursorCliClient(
			{ cursorCliPath: '' },
			{ spawnImpl, resolveExecutable: () => '/bin/cursor-agent' }
		);
		await expect(client.complete('a', 'b')).rejects.toThrow(/empty output/);
	});

	it('rejects when spawn hangs past timeout', async () => {
		vi.useFakeTimers();
		try {
			const kill = vi.fn();
			const spawnImpl = vi.fn(() => {
				const ee = new EventEmitter() as import('node:child_process').ChildProcess;
				const stdout = new EventEmitter();
				const stderr = new EventEmitter();
				(ee as unknown as { stdout: typeof stdout }).stdout = stdout;
				(ee as unknown as { stderr: typeof stderr }).stderr = stderr;
				(ee as unknown as { kill: typeof kill }).kill = kill;
				return ee;
			});
			const client = new CursorCliClient(
				{ cursorCliPath: '', timeoutSeconds: 1 },
				{ spawnImpl, resolveExecutable: () => '/bin/cursor-agent' }
			);
			const pending = client.complete('a', 'b');
			const expectation = expect(pending).rejects.toThrow(/timed out/);
			await vi.advanceTimersByTimeAsync(1001);
			await expectation;
			expect(kill).toHaveBeenCalledWith('SIGTERM');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('clampCursorCliSmokeTimeoutSeconds', () => {
	it('caps at ceiling while respecting floor', () => {
		expect(clampCursorCliSmokeTimeoutSeconds(900, 120)).toBe(120);
		expect(clampCursorCliSmokeTimeoutSeconds(300, 90)).toBe(90);
		expect(clampCursorCliSmokeTimeoutSeconds(45, 120)).toBe(45);
		expect(clampCursorCliSmokeTimeoutSeconds(5, 120)).toBe(30);
	});
});

describe('runCursorCliSmokeTest', () => {
	it('returns ok stdout when mocked spawn succeeds', async () => {
		const spawnImpl = mockSpawnSequence([
			{ code: 0, stdout: '\n SPEED_READER_PING_OK\n' }
		]);
		const r = await runCursorCliSmokeTest(
			{ cursorCliPath: '' },
			120,
			{ spawnImpl, resolveExecutable: () => '/bin/cursor-agent' }
		);
		expect(r.ok).toBe(true);
		if (!r.ok) {
			throw new Error('expected ok');
		}
		expect(r.stdout.trim()).toBe('SPEED_READER_PING_OK');
		expect(r.timeoutSecondsUsed).toBe(120);
	});

	it('returns message when mocked spawn exits non-zero', async () => {
		const spawnImpl = mockSpawnSequence([{ code: 1, stderr: 'nope\n' }]);
		const r = await runCursorCliSmokeTest(
			{ cursorCliPath: '' },
			60,
			{ spawnImpl, resolveExecutable: () => '/bin/cursor-agent' }
		);
		expect(r.ok).toBe(false);
		if (r.ok) {
			throw new Error('expected fail');
		}
		expect(r.message).toContain('failed');
	});
});
