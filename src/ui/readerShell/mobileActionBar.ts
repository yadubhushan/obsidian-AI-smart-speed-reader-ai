export interface MobileActionBarHandle {
	destroy(): void;
	setVisible(visible: boolean): void;
	onBookmark(cb: () => void): void;
	onBookmarkLongPress(cb: () => void): void;
	onDefine(cb: () => void): void;
	onMenu(cb: () => void): void;
}

const LONG_PRESS_MS = 500;

export function mountMobileActionBar(container: HTMLElement): MobileActionBarHandle {
	const bar = container.createDiv({ cls: 'speed-reader-ai-mobile-action-bar' });

	const bookmarkBtn = bar.createEl('button', {
		cls: 'speed-reader-ai-mobile-action-btn',
		text: '🔖',
		attr: { type: 'button', 'aria-label': 'Bookmark' }
	});
	const defineBtn = bar.createEl('button', {
		cls: 'speed-reader-ai-mobile-action-btn',
		text: '📖',
		attr: { type: 'button', 'aria-label': 'Define word' }
	});
	const menuBtn = bar.createEl('button', {
		cls: 'speed-reader-ai-mobile-action-btn',
		text: '☰',
		attr: { type: 'button', 'aria-label': 'Open settings menu' }
	});

	let bookmarkHandler: (() => void) | null = null;
	let bookmarkLongPressHandler: (() => void) | null = null;
	let defineHandler: (() => void) | null = null;
	let menuHandler: (() => void) | null = null;

	let bookmarkPressTimer: ReturnType<typeof setTimeout> | null = null;
	let bookmarkLongPressFired = false;

	const clearBookmarkPressTimer = () => {
		if (bookmarkPressTimer !== null) {
			clearTimeout(bookmarkPressTimer);
			bookmarkPressTimer = null;
		}
	};

	bookmarkBtn.addEventListener('pointerdown', (event) => {
		if (event.pointerType === 'mouse' && event.button !== 0) {
			return;
		}
		bookmarkLongPressFired = false;
		clearBookmarkPressTimer();
		bookmarkPressTimer = setTimeout(() => {
			bookmarkPressTimer = null;
			bookmarkLongPressFired = true;
			bookmarkLongPressHandler?.();
		}, LONG_PRESS_MS);
	});

	const cancelBookmarkPress = () => {
		clearBookmarkPressTimer();
	};

	bookmarkBtn.addEventListener('pointerup', cancelBookmarkPress);
	bookmarkBtn.addEventListener('pointercancel', cancelBookmarkPress);
	bookmarkBtn.addEventListener('pointerleave', cancelBookmarkPress);

	bookmarkBtn.addEventListener('click', () => {
		if (bookmarkLongPressFired) {
			bookmarkLongPressFired = false;
			return;
		}
		bookmarkHandler?.();
	});
	defineBtn.addEventListener('click', () => defineHandler?.());
	menuBtn.addEventListener('click', () => menuHandler?.());

	return {
		destroy() {
			clearBookmarkPressTimer();
			bar.remove();
		},
		setVisible(visible) {
			bar.toggleClass('is-hidden', !visible);
		},
		onBookmark(cb) {
			bookmarkHandler = cb;
		},
		onBookmarkLongPress(cb) {
			bookmarkLongPressHandler = cb;
		},
		onDefine(cb) {
			defineHandler = cb;
		},
		onMenu(cb) {
			menuHandler = cb;
		}
	};
}
