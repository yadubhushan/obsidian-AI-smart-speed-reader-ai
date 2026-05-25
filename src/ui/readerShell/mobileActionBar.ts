export interface MobileActionBarHandle {
	destroy(): void;
	setVisible(visible: boolean): void;
	onBookmark(cb: () => void): void;
	onBookmarkExplorer(cb: () => void): void;
	onDefine(cb: () => void): void;
	onMenu(cb: () => void): void;
}

export function mountMobileActionBar(container: HTMLElement): MobileActionBarHandle {
	const bar = container.createDiv({ cls: 'speed-reader-ai-mobile-action-bar' });

	const bookmarkBtn = bar.createEl('button', {
		cls: 'speed-reader-ai-mobile-action-btn',
		text: '🔖',
		attr: { type: 'button', 'aria-label': 'Bookmark current line' }
	});
	const bookmarkExplorerBtn = bar.createEl('button', {
		cls: 'speed-reader-ai-mobile-action-btn speed-reader-ai-mobile-bookmark-explorer-btn',
		text: '📑',
		attr: { type: 'button', 'aria-label': 'Bookmark lines' }
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
	let bookmarkExplorerHandler: (() => void) | null = null;
	let defineHandler: (() => void) | null = null;
	let menuHandler: (() => void) | null = null;

	bookmarkBtn.addEventListener('click', () => bookmarkHandler?.());
	bookmarkExplorerBtn.addEventListener('click', () => bookmarkExplorerHandler?.());
	defineBtn.addEventListener('click', () => defineHandler?.());
	menuBtn.addEventListener('click', () => menuHandler?.());

	return {
		destroy() {
			bar.remove();
		},
		setVisible(visible) {
			bar.toggleClass('is-hidden', !visible);
		},
		onBookmark(cb) {
			bookmarkHandler = cb;
		},
		onBookmarkExplorer(cb) {
			bookmarkExplorerHandler = cb;
		},
		onDefine(cb) {
			defineHandler = cb;
		},
		onMenu(cb) {
			menuHandler = cb;
		}
	};
}
