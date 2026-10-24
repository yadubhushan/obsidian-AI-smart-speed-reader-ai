import { setIcon } from 'obsidian';

export interface DesktopReaderDrawerHandle {
	destroy(): void;
	getBodyEl(): HTMLElement;
	setVisible(visible: boolean, title?: string): void;
}

export function mountDesktopReaderDrawer(
	container: HTMLElement,
	onClose: () => void
): DesktopReaderDrawerHandle {
	const root = container.createDiv({
		cls: 'speed-reader-ai-desktop-drawer is-hidden',
		attr: { role: 'dialog', 'aria-modal': 'true' }
	});
	const header = root.createDiv({ cls: 'speed-reader-ai-desktop-drawer-header' });
	const title = header.createEl('h3', { text: 'Reader' });
	const close = header.createEl('button', {
		cls: 'speed-reader-ai-adaptive-icon-button',
		attr: { type: 'button', 'aria-label': 'Close panel', title: 'Close panel' }
	});
	setIcon(close, 'x');
	const body = root.createDiv({ cls: 'speed-reader-ai-desktop-drawer-body' });
	close.addEventListener('click', onClose);

	return {
		destroy() {
			root.remove();
		},
		getBodyEl: () => body,
		setVisible(visible, nextTitle) {
			root.toggleClass('is-hidden', !visible);
			if (nextTitle) {
				title.setText(nextTitle);
				root.setAttr('aria-label', nextTitle);
			}
			if (visible) {
				close.focus();
			}
		}
	};
}

