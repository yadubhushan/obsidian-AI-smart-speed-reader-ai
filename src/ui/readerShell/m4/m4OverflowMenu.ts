import { Bookmark, FileText, Keyboard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { appendM4IconToButton } from './m4Icons';

export type M4OverflowRoute = 'content' | 'bookmarks' | 'shortcuts';

export interface M4OverflowMenuHandle {
	open(): void;
	close(): void;
	isOpen(): boolean;
	destroy(): void;
}

export interface M4OverflowMenuOptions {
	onSelect: (route: M4OverflowRoute) => void;
}

const OVERFLOW_ITEMS: { id: M4OverflowRoute; label: string; icon: LucideIcon }[] = [
	{ id: 'content', label: 'Content', icon: FileText },
	{ id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
	{ id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard }
];

export function mountM4OverflowMenu(
	container: HTMLElement,
	options: M4OverflowMenuOptions
): M4OverflowMenuHandle {
	const menu = container.createDiv({ cls: 'speed-reader-m4-overflow-menu is-hidden' });
	const panel = menu.createDiv({ cls: 'speed-reader-m4-overflow-menu__panel' });

	let open = false;

	for (const item of OVERFLOW_ITEMS) {
		const btn = panel.createEl('button', {
			cls: 'speed-reader-m4-overflow-item',
			attr: { type: 'button' }
		});
		appendM4IconToButton(btn, item.icon, {
			className: 'speed-reader-m4-icon speed-reader-m4-icon--sm',
			size: 16
		});
		btn.createSpan({ text: item.label, cls: 'speed-reader-m4-overflow-item__label' });
		btn.addEventListener('click', () => {
			options.onSelect(item.id);
			handle.close();
		});
	}

	const handle: M4OverflowMenuHandle = {
		open() {
			open = true;
			menu.removeClass('is-hidden');
		},
		close() {
			open = false;
			menu.addClass('is-hidden');
		},
		isOpen() {
			return open;
		},
		destroy() {
			menu.remove();
		}
	};

	menu.addEventListener('click', (event) => {
		if (event.target === menu) {
			handle.close();
		}
	});

	return handle;
}
