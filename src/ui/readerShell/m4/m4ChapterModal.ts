import { Check, X } from 'lucide-react';
import { appendM4IconToButton, createM4Icon } from './m4Icons';

export interface M4ChapterModalHandle {
	open(): void;
	close(): void;
	isOpen(): boolean;
	setItems(items: M4ChapterModalItem[]): void;
	destroy(): void;
}

export interface M4ChapterModalItem {
	id: string;
	label: string;
	active?: boolean;
}

export interface M4ChapterModalOptions {
	onSelect: (id: string) => void;
}

export function mountM4ChapterModal(
	container: HTMLElement,
	options: M4ChapterModalOptions
): M4ChapterModalHandle {
	const overlay = container.createDiv({ cls: 'speed-reader-m4-chapter-modal is-hidden' });
	const panel = overlay.createDiv({ cls: 'speed-reader-m4-chapter-modal__panel' });
	const header = panel.createDiv({ cls: 'speed-reader-m4-chapter-modal__header' });
	header.createEl('h3', { text: 'Chapters', cls: 'speed-reader-m4-chapter-modal__title' });
	const closeBtn = header.createEl('button', {
		cls: 'speed-reader-m4-top-btn speed-reader-m4-chapter-modal__close',
		attr: { type: 'button', 'aria-label': 'Close chapter list' }
	});
	appendM4IconToButton(closeBtn, X, { size: 16 });

	const list = panel.createDiv({ cls: 'speed-reader-m4-chapter-modal__list' });

	let items: M4ChapterModalItem[] = [];
	let open = false;

	const renderList = () => {
		list.empty();
		for (const item of items) {
			const btn = list.createEl('button', {
				cls: `speed-reader-m4-chapter-item${item.active ? ' is-active' : ''}`,
				attr: { type: 'button' }
			});
			btn.createSpan({ text: item.label, cls: 'speed-reader-m4-chapter-item__label' });
			if (item.active) {
				btn.appendChild(
					createM4Icon(Check, {
						className: 'speed-reader-m4-icon speed-reader-m4-icon--accent',
						size: 14
					})
				);
			}
			btn.addEventListener('click', () => {
				options.onSelect(item.id);
				handle.close();
			});
		}
	};

	const handle: M4ChapterModalHandle = {
		open() {
			open = true;
			overlay.removeClass('is-hidden');
		},
		close() {
			open = false;
			overlay.addClass('is-hidden');
		},
		isOpen() {
			return open;
		},
		setItems(next) {
			items = next;
			renderList();
		},
		destroy() {
			overlay.remove();
		}
	};

	closeBtn.addEventListener('click', () => handle.close());
	overlay.addEventListener('click', (event) => {
		if (event.target === overlay) {
			handle.close();
		}
	});

	return handle;
}
