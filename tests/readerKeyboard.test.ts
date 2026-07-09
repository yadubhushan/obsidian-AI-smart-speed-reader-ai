import { describe, expect, it } from 'vitest';
import type { Modifier, Scope } from 'obsidian';
import {
	executeReaderKeyAction,
	passesReaderKeyGate,
	READER_KEY_BINDINGS,
	registerReaderKeyboard,
	WPM_KEY_STEP,
	type ReaderKeyboardActions
} from '../src/ui/readerShell/readerKeyboard';
import { FONT_SIZE_STEP } from '../src/ui/readerShell/readerAppearance';

function createActions(overrides: Partial<ReaderKeyboardActions> = {}) {
	const calls: string[] = [];
	const record =
		(name: string) =>
		(...args: unknown[]) => {
			calls.push(args.length ? `${name}:${args.join(',')}` : name);
		};
	const actions: ReaderKeyboardActions = {
		isBlocked: () => false,
		isDictionaryVisible: () => false,
		dismissDictionaryIfVisible: () => false,
		togglePlayPause: record('togglePlayPause'),
		arrowLeft: record('arrowLeft'),
		arrowRight: record('arrowRight'),
		sectionPrev: record('sectionPrev'),
		sectionNext: record('sectionNext'),
		adjustWpm: record('adjustWpm'),
		adjustFontSize: record('adjustFontSize'),
		toggleFocusMode: record('toggleFocusMode'),
		togglePlaybackMode: record('togglePlaybackMode'),
		createBookmark: record('createBookmark'),
		openBookmarksTab: record('openBookmarksTab'),
		lookupCurrentWord: record('lookupCurrentWord'),
		back: () => {
			calls.push('back');
			return false;
		},
		forceClose: record('forceClose'),
		...overrides
	};
	return { actions, calls };
}

function binding(key: string, modifiers: Modifier[] = []) {
	const hit = READER_KEY_BINDINGS.find(
		(b) => b.key === key && b.modifiers.join(',') === modifiers.join(',')
	);
	if (!hit) throw new Error(`no binding for ${modifiers.join('+')}${key}`);
	return hit;
}

describe('READER_KEY_BINDINGS', () => {
	it('covers the full reader shortcut set', () => {
		expect(
			READER_KEY_BINDINGS.map((b) =>
				[...b.modifiers, b.key].join('+')
			).sort()
		).toEqual(
			[
				' ',
				'ArrowLeft',
				'ArrowRight',
				'Shift+ArrowLeft',
				'Shift+ArrowRight',
				'ArrowUp',
				'ArrowDown',
				'[',
				']',
				'f',
				'l',
				'b',
				'd',
				'Shift+b',
				'Escape'
			].sort()
		);
	});
});

describe('gating', () => {
	it('space is consumed by a visible dictionary before anything else', () => {
		const { actions, calls } = createActions({
			dismissDictionaryIfVisible: () => true
		});
		executeReaderKeyAction(binding(' '), actions);
		expect(calls).toEqual([]);
	});

	it('space is blocked by overlays', () => {
		const { actions, calls } = createActions({ isBlocked: () => true });
		executeReaderKeyAction(binding(' '), actions);
		expect(calls).toEqual([]);
	});

	it('space toggles playback when unblocked', () => {
		const { actions, calls } = createActions();
		executeReaderKeyAction(binding(' '), actions);
		expect(calls).toEqual(['togglePlayPause']);
	});

	it('bookmark keys are overlay-gated', () => {
		const blocked = createActions({ isBlocked: () => true });
		executeReaderKeyAction(binding('b'), blocked.actions);
		executeReaderKeyAction(binding('b', ['Shift']), blocked.actions);
		expect(blocked.calls).toEqual([]);

		const open = createActions();
		executeReaderKeyAction(binding('b'), open.actions);
		executeReaderKeyAction(binding('b', ['Shift']), open.actions);
		expect(open.calls).toEqual(['createBookmark', 'openBookmarksTab']);
	});

	it('dictionary lookup stays available while the dictionary overlay is open', () => {
		const { actions, calls } = createActions({
			isBlocked: () => true,
			isDictionaryVisible: () => true
		});
		executeReaderKeyAction(binding('d'), actions);
		expect(calls).toEqual(['lookupCurrentWord']);

		const blocked = createActions({ isBlocked: () => true });
		executeReaderKeyAction(binding('d'), blocked.actions);
		expect(blocked.calls).toEqual([]);
	});

	it('navigation and appearance keys are not overlay-gated', () => {
		const { actions, calls } = createActions({ isBlocked: () => true });
		executeReaderKeyAction(binding('ArrowLeft'), actions);
		executeReaderKeyAction(binding('ArrowUp'), actions);
		executeReaderKeyAction(binding(']'), actions);
		executeReaderKeyAction(binding('f'), actions);
		expect(calls).toEqual([
			'arrowLeft',
			`adjustWpm:${WPM_KEY_STEP}`,
			`adjustFontSize:${FONT_SIZE_STEP}`,
			'toggleFocusMode'
		]);
	});

	it('gate helper matches the binding gates', () => {
		const { actions } = createActions({ isBlocked: () => true });
		expect(passesReaderKeyGate('none', actions)).toBe(true);
		expect(passesReaderKeyGate('overlay', actions)).toBe(false);
	});
});

describe('escape', () => {
	it('prefers back-navigation and falls back to closing the modal', () => {
		const consumed = createActions({
			back: () => true
		});
		executeReaderKeyAction(binding('Escape'), consumed.actions);
		expect(consumed.calls).toEqual([]);

		const fallthrough = createActions();
		executeReaderKeyAction(binding('Escape'), fallthrough.actions);
		expect(fallthrough.calls).toEqual(['back', 'forceClose']);
	});
});

describe('registerReaderKeyboard', () => {
	function createFakeScope() {
		const registered: Array<{ modifiers: Modifier[]; key: string }> = [];
		const scope = {
			register: (modifiers: Modifier[], key: string) => {
				registered.push({ modifiers, key });
				return {};
			}
		} as unknown as Scope;
		return { scope, registered };
	}

	function createFakeContentEl() {
		const listeners = new Map<string, Array<(event: unknown) => void>>();
		return {
			listeners,
			addEventListener(type: string, cb: (event: unknown) => void) {
				listeners.set(type, [...(listeners.get(type) ?? []), cb]);
			},
			removeEventListener(type: string, cb: (event: unknown) => void) {
				listeners.set(
					type,
					(listeners.get(type) ?? []).filter((l) => l !== cb)
				);
			}
		} as unknown as HTMLElement & { listeners: Map<string, Array<(event: unknown) => void>> };
	}

	it('registers every binding on the scope plus the content space fallback', () => {
		const { scope, registered } = createFakeScope();
		const contentEl = createFakeContentEl();
		const { actions } = createActions();

		const cleanup = registerReaderKeyboard(scope, contentEl, actions);

		expect(registered).toHaveLength(READER_KEY_BINDINGS.length);
		expect(contentEl.listeners.get('keydown')).toHaveLength(1);

		cleanup();
		expect(contentEl.listeners.get('keydown')).toHaveLength(0);
	});

	it('content space fallback routes through the same gates', () => {
		const { scope } = createFakeScope();
		const contentEl = createFakeContentEl();
		const { actions, calls } = createActions();
		registerReaderKeyboard(scope, contentEl, actions);

		const keydown = contentEl.listeners.get('keydown')![0]!;
		keydown({ key: ' ', preventDefault: () => undefined });
		keydown({ key: 'x', preventDefault: () => undefined });

		expect(calls).toEqual(['togglePlayPause']);
	});
});
