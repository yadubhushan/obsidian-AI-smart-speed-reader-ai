import { isSwipeDown, isSwipeUp } from './mobileGestures';
import type { ReaderState, SpeedReaderAiSettings } from '../../types';

const TOP_BAR_SWIPE_CLOSE_WINDOW_MS = 2000;

export interface MobileTransportBarHandle {
	destroy(): void;
	update(state: ReaderState | null, settings: SpeedReaderAiSettings): void;
	setVisible(visible: boolean): void;
	getTopBarEl(): HTMLElement | null;
	setExpanded(expanded: boolean): void;
	isExpanded(): boolean;
	onSkipBack(cb: () => void): void;
	onPlayPause(cb: () => void): void;
	onSkipForward(cb: () => void): void;
	onBookmark(cb: () => void): void;
	onDefine(cb: () => void): void;
	onMenu(cb: () => void): void;
	onChapterTitleTap(cb: () => void): void;
	onClose(cb: () => void): void;
	setChapterNavVisible(visible: boolean): void;
}

function formatChapterTitle(state: ReaderState | null): string {
	if (state?.sectionTitle?.trim()) {
		const n = (state.currentSectionIndex ?? 0) + 1;
		const m = state.sectionCount ?? 0;
		const title = state.sectionTitle.trim();
		return m > 0 ? `${n}/${m} · ${title}` : title;
	}
	if (state?.currentHeading) {
		return state.currentHeading.text;
	}
	return 'Section';
}

function formatFullChapterTitle(state: ReaderState | null): string {
	if (state?.sectionTitle?.trim()) {
		return state.sectionTitle.trim();
	}
	if (state?.currentHeading) {
		return state.currentHeading.text;
	}
	return 'Section';
}

export function mountMobileTransportBar(
	shellEl: HTMLElement,
	insertTopBarAfter: HTMLElement | null
): MobileTransportBarHandle {
	const topBar = shellEl.createDiv({ cls: 'speed-reader-ai-mobile-top-bar' });
	if (insertTopBarAfter) {
		insertTopBarAfter.insertAdjacentElement('afterend', topBar);
	}

	const topBarMain = topBar.createDiv({ cls: 'speed-reader-ai-mobile-top-bar-main' });
	const chapterTitle = topBarMain.createEl('button', {
		cls: 'speed-reader-ai-mobile-chapter-title',
		text: 'Section',
		attr: { type: 'button' }
	});
	const closeBtn = topBarMain.createEl('button', {
		cls: 'speed-reader-ai-mobile-close',
		text: '✕',
		attr: { type: 'button', 'aria-label': 'Close reader' }
	});

	const topBarDetail = topBar.createDiv({
		cls: 'speed-reader-ai-mobile-top-bar-detail is-hidden'
	});
	const progressEl = topBarDetail.createDiv({
		cls: 'speed-reader-ai-mobile-top-bar-progress',
		text: '0%'
	});
	const fullTitleEl = topBarDetail.createDiv({
		cls: 'speed-reader-ai-mobile-top-bar-full-title',
		text: 'Section'
	});

	const transport = shellEl.createDiv({ cls: 'speed-reader-ai-mobile-transport' });
	const transportLeft = transport.createDiv({ cls: 'speed-reader-ai-mobile-transport-left' });

	const skipBackBtn = transportLeft.createEl('button', {
		cls: 'speed-reader-ai-mobile-transport-btn',
		text: '◀◀',
		attr: { type: 'button', 'aria-label': 'Skip back' }
	});
	const playBtn = transportLeft.createEl('button', {
		cls: 'speed-reader-ai-mobile-transport-btn speed-reader-ai-mobile-transport-play',
		text: '▶',
		attr: { type: 'button', 'aria-label': 'Play or pause' }
	});
	const skipForwardBtn = transportLeft.createEl('button', {
		cls: 'speed-reader-ai-mobile-transport-btn',
		text: '▶▶',
		attr: { type: 'button', 'aria-label': 'Skip forward' }
	});

	transport.createDiv({ cls: 'speed-reader-ai-mobile-transport-divider' });

	const transportRight = transport.createDiv({ cls: 'speed-reader-ai-mobile-transport-right' });
	const bookmarkBtn = transportRight.createEl('button', {
		cls: 'speed-reader-ai-mobile-transport-btn',
		text: '🔖',
		attr: { type: 'button', 'aria-label': 'Bookmark' }
	});
	const defineBtn = transportRight.createEl('button', {
		cls: 'speed-reader-ai-mobile-transport-btn',
		text: '📖',
		attr: { type: 'button', 'aria-label': 'Define word' }
	});
	const menuBtn = transportRight.createEl('button', {
		cls: 'speed-reader-ai-mobile-transport-btn',
		text: '☰',
		attr: { type: 'button', 'aria-label': 'Open menu' }
	});

	let skipBackHandler: (() => void) | null = null;
	let playPauseHandler: (() => void) | null = null;
	let skipForwardHandler: (() => void) | null = null;
	let bookmarkHandler: (() => void) | null = null;
	let defineHandler: (() => void) | null = null;
	let menuHandler: (() => void) | null = null;
	let chapterTitleTapHandler: (() => void) | null = null;
	let closeHandler: (() => void) | null = null;

	let expanded = false;
	let lastSwipeDownTime = 0;
	let topBarPointerId: number | null = null;
	let topBarStartX = 0;
	let topBarStartY = 0;
	let topBarStartTime = 0;
	let topBarSwipeHandled = false;

	skipBackBtn.addEventListener('click', () => skipBackHandler?.());
	playBtn.addEventListener('click', () => playPauseHandler?.());
	skipForwardBtn.addEventListener('click', () => skipForwardHandler?.());
	bookmarkBtn.addEventListener('click', () => bookmarkHandler?.());
	defineBtn.addEventListener('click', () => defineHandler?.());
	menuBtn.addEventListener('click', () => menuHandler?.());
	chapterTitle.addEventListener('click', () => {
		if (topBarSwipeHandled) {
			return;
		}
		chapterTitleTapHandler?.();
	});
	closeBtn.addEventListener('click', () => closeHandler?.());

	const setExpandedState = (value: boolean) => {
		expanded = value;
		topBar.toggleClass('is-expanded', expanded);
		topBarDetail.toggleClass('is-hidden', !expanded);
		if (!expanded) {
			lastSwipeDownTime = 0;
		}
	};

	const onTopBarPointerDown = (event: PointerEvent) => {
		if (topBar.hasClass('is-hidden')) {
			return;
		}
		if (event.pointerType === 'mouse' && event.button !== 0) {
			return;
		}
		topBarPointerId = event.pointerId;
		topBarStartX = event.clientX;
		topBarStartY = event.clientY;
		topBarStartTime = Date.now();
		topBarSwipeHandled = false;
	};

	const onTopBarPointerUp = (event: PointerEvent) => {
		if (topBarPointerId === null || event.pointerId !== topBarPointerId) {
			return;
		}
		const dx = event.clientX - topBarStartX;
		const dy = event.clientY - topBarStartY;
		const elapsed = Date.now() - topBarStartTime;
		topBarPointerId = null;

		if (isSwipeDown(dy, dx, elapsed)) {
			topBarSwipeHandled = true;
			const now = Date.now();
			if (expanded && now - lastSwipeDownTime <= TOP_BAR_SWIPE_CLOSE_WINDOW_MS) {
				closeHandler?.();
				return;
			}
			lastSwipeDownTime = now;
			setExpandedState(true);
			return;
		}

		if (expanded && isSwipeUp(dy, dx, elapsed)) {
			topBarSwipeHandled = true;
			setExpandedState(false);
		}
	};

	const onTopBarPointerCancel = (event: PointerEvent) => {
		if (event.pointerId === topBarPointerId) {
			topBarPointerId = null;
		}
	};

	topBar.addEventListener('pointerdown', onTopBarPointerDown);
	topBar.addEventListener('pointerup', onTopBarPointerUp);
	topBar.addEventListener('pointercancel', onTopBarPointerCancel);

	const setChromeVisible = (visible: boolean) => {
		topBar.toggleClass('is-hidden', !visible);
		transport.toggleClass('is-hidden', !visible);
		if (!visible) {
			setExpandedState(false);
		}
	};

	return {
		destroy() {
			topBar.removeEventListener('pointerdown', onTopBarPointerDown);
			topBar.removeEventListener('pointerup', onTopBarPointerUp);
			topBar.removeEventListener('pointercancel', onTopBarPointerCancel);
			topBar.remove();
			transport.remove();
		},
		update(state, _settings) {
			playBtn.setText(state?.isPlaying ? '⏸' : '▶');
			chapterTitle.setText(formatChapterTitle(state));
			const progress = Math.min(Math.round(state?.progress ?? 0), 100);
			progressEl.setText(`${progress}%`);
			fullTitleEl.setText(formatFullChapterTitle(state));
		},
		setVisible(visible) {
			setChromeVisible(visible);
		},
		getTopBarEl: () => topBar,
		setExpanded(value) {
			setExpandedState(value);
		},
		isExpanded() {
			return expanded;
		},
		onSkipBack(cb) {
			skipBackHandler = cb;
		},
		onPlayPause(cb) {
			playPauseHandler = cb;
		},
		onSkipForward(cb) {
			skipForwardHandler = cb;
		},
		onBookmark(cb) {
			bookmarkHandler = cb;
		},
		onDefine(cb) {
			defineHandler = cb;
		},
		onMenu(cb) {
			menuHandler = cb;
		},
		onChapterTitleTap(cb) {
			chapterTitleTapHandler = cb;
		},
		onClose(cb) {
			closeHandler = cb;
		},
		setChapterNavVisible(visible) {
			chapterTitle.toggleClass('is-hidden', !visible);
		}
	};
}
