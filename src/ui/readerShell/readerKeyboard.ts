import type { Modifier, Scope } from 'obsidian';
import { FONT_SIZE_STEP } from './readerAppearance';

export const WPM_KEY_STEP = 25;

export type ReaderKeyGate =
	/** Always runs. */
	| 'none'
	/** Skipped while an overlay (prepare, inter-section, dictionary, menu) blocks input. */
	| 'overlay'
	/** Overlay-gated, but still allowed while the dictionary overlay is open. */
	| 'overlay-except-dictionary'
	/** First keypress dismisses an open dictionary; otherwise overlay-gated. */
	| 'dictionary-dismiss-first';

export type ReaderKeyAction =
	| 'toggle-play-pause'
	| 'arrow-left'
	| 'arrow-right'
	| 'section-prev'
	| 'section-next'
	| 'wpm-up'
	| 'wpm-down'
	| 'font-smaller'
	| 'font-larger'
	| 'toggle-focus-mode'
	| 'toggle-playback-mode'
	| 'create-bookmark'
	| 'lookup-word'
	| 'open-bookmarks-tab'
	| 'back-or-close';

export interface ReaderKeyBinding {
	modifiers: Modifier[];
	key: string;
	action: ReaderKeyAction;
	gate: ReaderKeyGate;
}

export const READER_KEY_BINDINGS: readonly ReaderKeyBinding[] = [
	{ modifiers: [], key: ' ', action: 'toggle-play-pause', gate: 'dictionary-dismiss-first' },
	{ modifiers: [], key: 'ArrowLeft', action: 'arrow-left', gate: 'none' },
	{ modifiers: [], key: 'ArrowRight', action: 'arrow-right', gate: 'none' },
	{ modifiers: ['Shift'], key: 'ArrowLeft', action: 'section-prev', gate: 'none' },
	{ modifiers: ['Shift'], key: 'ArrowRight', action: 'section-next', gate: 'none' },
	{ modifiers: [], key: 'ArrowUp', action: 'wpm-up', gate: 'none' },
	{ modifiers: [], key: 'ArrowDown', action: 'wpm-down', gate: 'none' },
	{ modifiers: [], key: '[', action: 'font-smaller', gate: 'none' },
	{ modifiers: [], key: ']', action: 'font-larger', gate: 'none' },
	{ modifiers: [], key: 'f', action: 'toggle-focus-mode', gate: 'none' },
	{ modifiers: [], key: 'l', action: 'toggle-playback-mode', gate: 'none' },
	{ modifiers: [], key: 'b', action: 'create-bookmark', gate: 'overlay' },
	{ modifiers: [], key: 'd', action: 'lookup-word', gate: 'overlay-except-dictionary' },
	{ modifiers: ['Shift'], key: 'b', action: 'open-bookmarks-tab', gate: 'overlay' },
	{ modifiers: [], key: 'Escape', action: 'back-or-close', gate: 'none' }
];

export interface ReaderKeyboardActions {
	isBlocked(): boolean;
	isDictionaryVisible(): boolean;
	/** Returns true if a visible dictionary was dismissed (consumes the keypress). */
	dismissDictionaryIfVisible(): boolean;
	togglePlayPause(): void;
	arrowLeft(): void;
	arrowRight(): void;
	sectionPrev(): void;
	sectionNext(): void;
	adjustWpm(delta: number): void;
	adjustFontSize(delta: number): void;
	toggleFocusMode(): void;
	togglePlaybackMode(): void;
	createBookmark(): void;
	openBookmarksTab(): void;
	lookupCurrentWord(): void;
	/** Returns true if back-navigation consumed the keypress. */
	back(): boolean;
	forceClose(): void;
}

export function passesReaderKeyGate(
	gate: ReaderKeyGate,
	actions: ReaderKeyboardActions
): boolean {
	switch (gate) {
		case 'none':
			return true;
		case 'overlay':
			return !actions.isBlocked();
		case 'overlay-except-dictionary':
			return !actions.isBlocked() || actions.isDictionaryVisible();
		case 'dictionary-dismiss-first':
			if (actions.dismissDictionaryIfVisible()) {
				return false;
			}
			return !actions.isBlocked();
	}
}

export function executeReaderKeyAction(
	binding: ReaderKeyBinding,
	actions: ReaderKeyboardActions
): void {
	if (!passesReaderKeyGate(binding.gate, actions)) {
		return;
	}
	switch (binding.action) {
		case 'toggle-play-pause':
			actions.togglePlayPause();
			break;
		case 'arrow-left':
			actions.arrowLeft();
			break;
		case 'arrow-right':
			actions.arrowRight();
			break;
		case 'section-prev':
			actions.sectionPrev();
			break;
		case 'section-next':
			actions.sectionNext();
			break;
		case 'wpm-up':
			actions.adjustWpm(WPM_KEY_STEP);
			break;
		case 'wpm-down':
			actions.adjustWpm(-WPM_KEY_STEP);
			break;
		case 'font-smaller':
			actions.adjustFontSize(-FONT_SIZE_STEP);
			break;
		case 'font-larger':
			actions.adjustFontSize(FONT_SIZE_STEP);
			break;
		case 'toggle-focus-mode':
			actions.toggleFocusMode();
			break;
		case 'toggle-playback-mode':
			actions.togglePlaybackMode();
			break;
		case 'create-bookmark':
			actions.createBookmark();
			break;
		case 'lookup-word':
			actions.lookupCurrentWord();
			break;
		case 'open-bookmarks-tab':
			actions.openBookmarksTab();
			break;
		case 'back-or-close':
			if (!actions.back()) {
				actions.forceClose();
			}
			break;
	}
}

const SPACE_BINDING = READER_KEY_BINDINGS.find((b) => b.key === ' ')!;

/**
 * Registers the binding table on the modal scope plus the content-element
 * space fallback (for when focus sits inside the reader content).
 * Returns a cleanup for the content-element listener.
 */
export function registerReaderKeyboard(
	scope: Scope,
	contentEl: HTMLElement,
	actions: ReaderKeyboardActions
): () => void {
	for (const binding of READER_KEY_BINDINGS) {
		scope.register(binding.modifiers, binding.key, (event) => {
			event.preventDefault();
			executeReaderKeyAction(binding, actions);
			return false;
		});
	}

	const onContentKeydown = (event: KeyboardEvent) => {
		if (event.key === ' ') {
			event.preventDefault();
			executeReaderKeyAction(SPACE_BINDING, actions);
		}
	};
	contentEl.addEventListener('keydown', onContentKeydown);
	return () => contentEl.removeEventListener('keydown', onContentKeydown);
}
