import type { RSVPEngine } from '../../engine/rsvpEngine';
import { getSectionPickerOptions } from './mobileSectionPicker';

export interface MobileBottomSheetHandle {
	destroy(): void;
	open(): void;
	close(): void;
	isOpen(): boolean;
	onOpenChange(cb: (open: boolean) => void): void;
}

export function mountMobileBottomSheet(
	shellEl: HTMLElement,
	engine: RSVPEngine,
	options: {
		onChapterSelect: (sectionId: string) => void;
		onFabClick?: () => void;
	}
): MobileBottomSheetHandle {
	const root = shellEl.createDiv({ cls: 'speed-reader-ai-mobile-sheet-root' });
	if (options.onFabClick) {
		const fab = root.createEl('button', {
			cls: 'speed-reader-ai-mobile-fab',
			text: '☰',
			attr: { type: 'button', 'aria-label': 'Open menu' }
		});
		fab.addEventListener('click', () => {
			options.onFabClick?.();
		});
	}

	const backdrop = root.createDiv({ cls: 'speed-reader-ai-mobile-sheet-backdrop is-hidden' });
	const sheet = root.createDiv({ cls: 'speed-reader-ai-mobile-sheet is-hidden' });
	const bodyHost = sheet.createDiv({ cls: 'speed-reader-ai-mobile-sheet-body' });

	const chapterSection = bodyHost.createDiv({ cls: 'speed-reader-ai-mobile-sheet-chapters' });
	const chapterTitle = chapterSection.createDiv({
		cls: 'speed-reader-ai-mobile-sheet-section-title',
		text: 'Jump to chapter'
	});
	const chapterList = chapterSection.createDiv({ cls: 'speed-reader-ai-mobile-sheet-chapter-list' });

	let open = false;
	const openListeners: Array<(open: boolean) => void> = [];

	function notifyOpenChange() {
		for (const listener of openListeners) {
			listener(open);
		}
	}

	function rebuildChapterList() {
		chapterList.empty();
		const items = getSectionPickerOptions(engine);
		if (items.length === 0) {
			chapterSection.addClass('is-hidden');
			return;
		}
		chapterSection.removeClass('is-hidden');
		chapterTitle.setText(
			engine.getSectionList().length > 0 ? 'Jump to chapter' : 'Jump to section'
		);
		for (const item of items) {
			const btn = chapterList.createEl('button', {
				cls: 'speed-reader-ai-mobile-sheet-chapter-btn',
				text: item.title,
				attr: { type: 'button' }
			});
			btn.addEventListener('click', () => {
				options.onChapterSelect(item.id);
				closeSheet();
			});
		}
	}

	function openSheet() {
		if (open) {
			return;
		}
		open = true;
		backdrop.removeClass('is-hidden');
		sheet.removeClass('is-hidden');
		root.addClass('is-sheet-open');
		rebuildChapterList();
		notifyOpenChange();
	}

	function closeSheet() {
		if (!open) {
			return;
		}
		open = false;
		backdrop.addClass('is-hidden');
		sheet.addClass('is-hidden');
		root.removeClass('is-sheet-open');
		notifyOpenChange();
	}

	const onBackdropClick = () => closeSheet();
	backdrop.addEventListener('click', onBackdropClick);

	return {
		destroy() {
			backdrop.removeEventListener('click', onBackdropClick);
			root.remove();
		},
		open: openSheet,
		close: closeSheet,
		isOpen: () => open,
		onOpenChange(cb) {
			openListeners.push(cb);
		}
	};
}
