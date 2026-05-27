import type { SpeedReaderAiSettings } from '../../../types';
import type { ContextLineHandle } from '../contextLine';
import { mountM4OverflowMenu, type M4OverflowRoute } from './m4OverflowMenu';
import { mountM4PhoneFrame } from './m4PhoneFrame';
import { mountM4ReaderView, type M4ReaderViewHandle } from './m4ReaderView';
import type { M4ChapterModalItem } from './m4ChapterModal';
import { mountM4SettingsView, type M4SettingsViewHandle } from './m4SettingsView';

export type M4ShellRoute = 'reader' | 'settings' | M4OverflowRoute;

export interface M4ReaderShellHandle {
	getShellEl(): HTMLElement;
	getRoute(): M4ShellRoute;
	setRoute(route: M4ShellRoute): void;
	popRoute(): boolean;
	getReaderView(): M4ReaderViewHandle | null;
	getContextLine(): ContextLineHandle | null;
	getWordContainerEl(): HTMLElement | null;
	getWordDisplayEl(): HTMLElement | null;
	getOverlayHostEl(): HTMLElement | null;
	setChapterProgress(progress: string, chapterLabel: string): void;
	setChapterItems(items: M4ChapterModalItem[]): void;
	closeOverlays(): boolean;
	syncFocusState(focusMode: boolean, isPlaying: boolean): void;
	syncMobilePlaying(playing: boolean): void;
	updateSettings(settings: SpeedReaderAiSettings): void;
	isOverflowOpen(): boolean;
	isChapterModalOpen(): boolean;
	destroy(): void;
}

export interface M4ReaderShellCallbacks {
	onTapPlayPause: () => void;
	onWpmDelta: (delta: number) => void;
	onFontDelta: (delta: number) => void;
	onChunkSizeChange: (size: 1 | 2 | 3) => void;
	onGuideLineToggle: (enabled: boolean) => void;
	onBookmarkOnce: () => void;
	onBookmarkExplorer: () => void;
	onClose: () => void;
	onChapterSelect: (id: string) => void;
	onChapterPillTap: () => void;
	onWordSeek: (word: string) => void;
	onWordLookup: (word: string) => void;
	onSaveSettings: (settings: SpeedReaderAiSettings) => void;
	onDefaultsSettings: () => SpeedReaderAiSettings;
	onResetFontSize: () => void;
	onSecondaryRoute: (route: M4OverflowRoute) => void;
	structuredBarHost?: HTMLElement;
	secondaryPaneHost?: HTMLElement;
}

export interface M4ReaderShellOptions {
	settings: SpeedReaderAiSettings;
	isMobile: boolean;
	initialRoute?: M4ShellRoute;
	preferencesOnly?: boolean;
	callbacks: M4ReaderShellCallbacks;
}

export function renderM4ReaderShell(
	container: HTMLElement,
	options: M4ReaderShellOptions
): M4ReaderShellHandle {
	const shell = container.createDiv({ cls: 'speed-reader-m4-shell speed-reader-ai-shell is-m4' });
	const phoneFrame = mountM4PhoneFrame(shell, options.isMobile);
	const inner = phoneFrame.getInnerEl();

	const routeHost = inner.createDiv({ cls: 'speed-reader-m4-route-host' });
	const readerHost = routeHost.createDiv({ cls: 'speed-reader-m4-route speed-reader-m4-route--reader' });
	const settingsHost = routeHost.createDiv({
		cls: 'speed-reader-m4-route speed-reader-m4-route--settings is-hidden'
	});
	const secondaryHost = options.callbacks.secondaryPaneHost;
	if (secondaryHost) {
		secondaryHost.addClass('speed-reader-m4-secondary-pane');
		inner.appendChild(secondaryHost);
	}

	let route: M4ShellRoute = options.initialRoute ?? (options.preferencesOnly ? 'settings' : 'reader');
	let settingsView: M4SettingsViewHandle | null = null;

	const overflow = mountM4OverflowMenu(inner, {
		onSelect: (r) => {
			options.callbacks.onSecondaryRoute(r);
			setRouteInternal(r);
		}
	});

	const readerView = options.preferencesOnly
		? null
		: mountM4ReaderView(readerHost, {
				settings: options.settings,
				isMobile: options.isMobile,
				structuredBarHost: options.callbacks.structuredBarHost,
				onTapPlayPause: options.callbacks.onTapPlayPause,
				onWpmDelta: options.callbacks.onWpmDelta,
				onFontDelta: options.callbacks.onFontDelta,
				onChunkSizeChange: options.callbacks.onChunkSizeChange,
				onGuideLineToggle: options.callbacks.onGuideLineToggle,
				onBookmarkOnce: options.callbacks.onBookmarkOnce,
				onBookmarkExplorer: options.callbacks.onBookmarkExplorer,
				onOpenSettings: () => setRouteInternal('settings'),
				onClose: options.callbacks.onClose,
				onOverflow: () => overflow.open(),
				onChapterSelect: options.callbacks.onChapterSelect,
				onChapterPillTap: options.callbacks.onChapterPillTap,
				onWordSeek: options.callbacks.onWordSeek,
				onWordLookup: options.callbacks.onWordLookup
			});

	settingsView = mountM4SettingsView(settingsHost, {
		settings: options.settings,
		isMobile: options.isMobile,
		showGesturesGuide: options.isMobile,
		onSave: options.callbacks.onSaveSettings,
		onDefaults: options.callbacks.onDefaultsSettings,
		onResetFontSize: options.callbacks.onResetFontSize,
		onBack: () => {
			if (options.preferencesOnly) {
				options.callbacks.onClose();
				return;
			}
			setRouteInternal('reader');
		}
	});

	const applyRouteVisibility = () => {
		readerHost.toggleClass('is-hidden', route !== 'reader');
		settingsHost.toggleClass('is-hidden', route !== 'settings');
		if (secondaryHost) {
			secondaryHost.toggleClass(
				'is-hidden',
				route !== 'content' && route !== 'bookmarks' && route !== 'shortcuts'
			);
			secondaryHost.toggleClass('is-stack-active', route !== 'reader' && route !== 'settings');
		}
		shell.toggleClass('is-settings-route', route === 'settings');
		shell.toggleClass(
			'is-secondary-route',
			route === 'content' || route === 'bookmarks' || route === 'shortcuts'
		);
		if (route === 'settings') {
			settingsView?.refresh(options.settings);
		}
	};

	function setRouteInternal(next: M4ShellRoute) {
		route = next;
		overflow.close();
		applyRouteVisibility();
	}

	setRouteInternal(route);

	const handle: M4ReaderShellHandle = {
		getShellEl() {
			return shell;
		},
		getRoute() {
			return route;
		},
		setRoute(next) {
			setRouteInternal(next);
		},
		popRoute() {
			if (overflow.isOpen()) {
				overflow.close();
				return true;
			}
			if (readerView?.closeChapterModal()) {
				return true;
			}
			if (route === 'content' || route === 'bookmarks' || route === 'shortcuts') {
				setRouteInternal('reader');
				return true;
			}
			if (route === 'settings' && !options.preferencesOnly) {
				setRouteInternal('reader');
				return true;
			}
			return false;
		},
		getReaderView() {
			return readerView;
		},
		getContextLine() {
			return readerView?.getContextLine() ?? null;
		},
		getWordContainerEl() {
			return readerView?.getWordContainerEl() ?? null;
		},
		getWordDisplayEl() {
			return readerView?.getWordDisplayEl() ?? null;
		},
		getOverlayHostEl() {
			return readerView?.getRsvpPanel().getOverlayHostEl() ?? null;
		},
		setChapterProgress(progress, chapterLabel) {
			readerView?.setChapterProgress(progress, chapterLabel);
		},
		setChapterItems(items) {
			readerView?.setChapterItems(items);
		},
		closeOverlays() {
			return handle.popRoute();
		},
		syncFocusState(focusMode, isPlaying) {
			shell.toggleClass('speed-reader-m4-focus-mode', focusMode);
			shell.toggleClass('speed-reader-m4-focus-playing', isPlaying);
			if (readerView) {
				readerView.setChromeVisible(!isPlaying);
			}
		},
		syncMobilePlaying(playing) {
			shell.toggleClass('speed-reader-m4-mobile-playing', playing);
			readerView?.setChromeVisible(!playing);
		},
		updateSettings(settings) {
			options.settings = settings;
			readerView?.updateControls(settings);
			if (route === 'settings') {
				settingsView?.refresh(settings);
			}
		},
		isOverflowOpen() {
			return overflow.isOpen();
		},
		isChapterModalOpen() {
			return false;
		},
		destroy() {
			overflow.destroy();
			readerView?.destroy();
			settingsView?.destroy();
			phoneFrame.destroy();
			shell.remove();
		}
	};

	return handle;
}
