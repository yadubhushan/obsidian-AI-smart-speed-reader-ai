import { describe, expect, it } from 'vitest';
import type { MarkdownView, Menu, Plugin } from 'obsidian';
import {
	registerReaderCommands,
	type ReaderCommandHost
} from '../src/boot/registerReaderCommands';
import type { SpeedReaderOpen } from '../src/ui/speedReaderOpen';

interface RegisteredCommand {
	id: string;
	name: string;
	callback?: () => void;
	checkCallback?: (checking: boolean) => boolean | void;
	editorCheckCallback?: (checking: boolean, editor: unknown) => boolean | void;
}

interface FakePluginHarness {
	plugin: Plugin;
	commands: RegisteredCommand[];
	ribbonCallbacks: Array<() => void>;
	workspaceHandlers: Map<string, (...args: unknown[]) => void>;
}

function createFakePlugin(activeView: unknown): FakePluginHarness {
	const commands: RegisteredCommand[] = [];
	const ribbonCallbacks: Array<() => void> = [];
	const workspaceHandlers = new Map<string, (...args: unknown[]) => void>();
	const plugin = {
		app: {
			workspace: {
				getActiveViewOfType: () => activeView,
				on: (name: string, handler: (...args: unknown[]) => void) => {
					workspaceHandlers.set(name, handler);
					return { name };
				}
			}
		},
		addRibbonIcon: (_icon: string, _title: string, cb: () => void) => {
			ribbonCallbacks.push(cb);
			return {};
		},
		addCommand: (command: RegisteredCommand) => {
			commands.push(command);
			return command;
		},
		registerEvent: () => undefined
	} as unknown as Plugin;
	return { plugin, commands, ribbonCallbacks, workspaceHandlers };
}

interface HostCall {
	method: string;
	args: unknown[];
}

function createHostStub(): { host: ReaderCommandHost; calls: HostCall[] } {
	const calls: HostCall[] = [];
	const host: ReaderCommandHost = {
		startSpeedReading(view: MarkdownView, fromCursor?: boolean) {
			calls.push({ method: 'startSpeedReading', args: [view, fromCursor] });
		},
		async openSpeedReader(open: SpeedReaderOpen) {
			calls.push({ method: 'openSpeedReader', args: [open] });
		},
		async openReaderPreferences(initialTab) {
			calls.push({ method: 'openReaderPreferences', args: [initialTab] });
		}
	};
	return { host, calls };
}

function createFakeEditor(selection: string) {
	return { getSelection: () => selection };
}

function createFakeMenu(): { menu: Menu; clickHandlers: Array<() => void> } {
	const clickHandlers: Array<() => void> = [];
	const item = {
		setTitle: () => item,
		setIcon: () => item,
		onClick: (cb: () => void) => {
			clickHandlers.push(cb);
			return item;
		}
	};
	const menu = {
		addItem: (build: (i: typeof item) => void) => {
			build(item);
			return menu;
		}
	} as unknown as Menu;
	return { menu, clickHandlers };
}

describe('registerReaderCommands', () => {
	it('registers the four commands, ribbon icon, and editor-menu handler', () => {
		const harness = createFakePlugin(null);
		const { host } = createHostStub();

		registerReaderCommands(harness.plugin, host);

		expect(harness.commands.map((c) => c.id)).toEqual([
			'start-speed-reading',
			'speed-read-selection',
			'read-entire-note',
			'open-speed-reader-preferences'
		]);
		expect(harness.ribbonCallbacks).toHaveLength(1);
		expect(harness.workspaceHandlers.has('editor-menu')).toBe(true);
	});

	it('routes start-speed-reading through checkCallback only when a markdown view is active', () => {
		const view = { kind: 'fake-view' };
		const harness = createFakePlugin(view);
		const { host, calls } = createHostStub();
		registerReaderCommands(harness.plugin, host);

		const command = harness.commands.find((c) => c.id === 'start-speed-reading')!;
		expect(command.checkCallback!(true)).toBe(true);
		expect(calls).toEqual([]);

		command.checkCallback!(false);
		expect(calls).toEqual([{ method: 'startSpeedReading', args: [view, undefined] }]);

		const noView = createFakePlugin(null);
		registerReaderCommands(noView.plugin, host);
		const gated = noView.commands.find((c) => c.id === 'start-speed-reading')!;
		expect(gated.checkCallback!(true)).toBe(false);
	});

	it('read-entire-note starts reading from the cursor', () => {
		const view = { kind: 'fake-view' };
		const harness = createFakePlugin(view);
		const { host, calls } = createHostStub();
		registerReaderCommands(harness.plugin, host);

		harness.commands.find((c) => c.id === 'read-entire-note')!.checkCallback!(false);

		expect(calls).toEqual([{ method: 'startSpeedReading', args: [view, true] }]);
	});

	it('speed-read-selection opens the reader with the selected text', () => {
		const harness = createFakePlugin(null);
		const { host, calls } = createHostStub();
		registerReaderCommands(harness.plugin, host);
		const command = harness.commands.find((c) => c.id === 'speed-read-selection')!;

		expect(command.editorCheckCallback!(true, createFakeEditor(''))).toBe(false);
		expect(command.editorCheckCallback!(true, createFakeEditor('hello world'))).toBe(true);
		expect(calls).toEqual([]);

		command.editorCheckCallback!(false, createFakeEditor('hello world'));
		expect(calls).toEqual([
			{ method: 'openSpeedReader', args: [{ kind: 'legacy', text: 'hello world' }] }
		]);
	});

	it('opens preferences on the settings tab', () => {
		const harness = createFakePlugin(null);
		const { host, calls } = createHostStub();
		registerReaderCommands(harness.plugin, host);

		harness.commands.find((c) => c.id === 'open-speed-reader-preferences')!.callback!();

		expect(calls).toEqual([{ method: 'openReaderPreferences', args: ['settings'] }]);
	});

	it('adds an editor-menu item only for non-empty selections', () => {
		const harness = createFakePlugin(null);
		const { host, calls } = createHostStub();
		registerReaderCommands(harness.plugin, host);
		const handler = harness.workspaceHandlers.get('editor-menu')!;

		const emptyMenu = createFakeMenu();
		handler(emptyMenu.menu, createFakeEditor('   '));
		expect(emptyMenu.clickHandlers).toHaveLength(0);

		const menu = createFakeMenu();
		handler(menu.menu, createFakeEditor('some text'));
		expect(menu.clickHandlers).toHaveLength(1);

		menu.clickHandlers[0]!();
		expect(calls).toEqual([
			{ method: 'openSpeedReader', args: [{ kind: 'legacy', text: 'some text' }] }
		]);
	});
});
