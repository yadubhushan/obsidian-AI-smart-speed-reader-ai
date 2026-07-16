import type { Workspace } from 'obsidian';
import { applyDesktopFocusChrome, type SidebarSnapshot } from './desktopFocusChrome';
import { setReaderImmersiveBlackout } from './readerImmersiveBlackout';

export type FocusEventKind = 'visibilitychange' | 'window-blur';
export type VisibilityAction = 'pause' | 'resume' | 'none';

export interface VisibilityState {
	docHidden: boolean;
	isPlaying: boolean;
	wasPausedByBlur: boolean;
}

/**
 * Playback policy for app/window focus changes: pause when the reader loses
 * the foreground, resume only if the pause was ours.
 */
export function resolveVisibilityAction(
	event: FocusEventKind,
	state: VisibilityState
): VisibilityAction {
	if (event === 'visibilitychange') {
		if (state.docHidden) {
			return state.isPlaying ? 'pause' : 'none';
		}
		return state.wasPausedByBlur ? 'resume' : 'none';
	}
	// Window blur while the document stays visible (focus moved to another app window).
	if (!state.docHidden) {
		return state.isPlaying ? 'pause' : 'none';
	}
	return 'none';
}

export interface ReaderFocusDeps {
	getDoc(): Document;
	contentEl: HTMLElement;
	containerEl: HTMLElement;
	isMobile: boolean;
	workspace: Workspace;
	isPlaying(): boolean;
	pause(): void;
	play(): void;
	/** Runs before entering focus mode (e.g. switch back to the home tab). */
	beforeEnterFocus(): void;
	render(): void;
}

export interface ReaderFocusHandle {
	register(): void;
	unregister(): void;
	setFocusMode(enabled: boolean): void;
	isFocusMode(): boolean;
	/** True while focus-mode chrome (classes or a sidebar snapshot) needs teardown. */
	hasFocusChrome(): boolean;
	refocusContent(): void;
}

/**
 * Owns focus mode (reader chrome + desktop sidebar snapshot) and the
 * pause-on-background / resume-on-foreground listeners.
 */
export function createReaderFocusController(deps: ReaderFocusDeps): ReaderFocusHandle {
	let focusMode = false;
	let sidebarSnapshot: SidebarSnapshot | null = null;
	let wasPausedByBlur = false;

	const applyAction = (action: VisibilityAction) => {
		if (action === 'pause') {
			wasPausedByBlur = true;
			deps.pause();
		} else if (action === 'resume') {
			wasPausedByBlur = false;
			deps.play();
		}
	};

	const visibilityState = (): VisibilityState => ({
		docHidden: deps.getDoc().hidden,
		isPlaying: deps.isPlaying(),
		wasPausedByBlur
	});

	const onVisibilityChange = () => {
		applyAction(resolveVisibilityAction('visibilitychange', visibilityState()));
	};
	const onWindowBlur = () => {
		applyAction(resolveVisibilityAction('window-blur', visibilityState()));
	};

	return {
		register(): void {
			const doc = deps.getDoc();
			doc.addEventListener('visibilitychange', onVisibilityChange);
			doc.defaultView?.addEventListener('blur', onWindowBlur);
		},
		unregister(): void {
			const doc = deps.getDoc();
			doc.removeEventListener('visibilitychange', onVisibilityChange);
			doc.defaultView?.removeEventListener('blur', onWindowBlur);
		},
		setFocusMode(enabled: boolean): void {
			if (enabled) {
				deps.beforeEnterFocus();
			}
			focusMode = enabled;
			deps.contentEl.toggleClass('speed-reader-ai-focus-active', focusMode);
			deps.containerEl.toggleClass('is-focus-active', focusMode);
			setReaderImmersiveBlackout(deps.getDoc(), deps.containerEl, focusMode);
			if (!deps.isMobile) {
				sidebarSnapshot = applyDesktopFocusChrome(deps.workspace, enabled, sidebarSnapshot);
			}
			deps.render();
		},
		isFocusMode(): boolean {
			return focusMode;
		},
		hasFocusChrome(): boolean {
			return focusMode || sidebarSnapshot !== null;
		},
		refocusContent(): void {
			const active = deps.getDoc().activeElement;
			if (active instanceof HTMLButtonElement || active instanceof HTMLSelectElement) {
				deps.contentEl.focus();
			}
		}
	};
}
