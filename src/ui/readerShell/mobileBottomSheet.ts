import type { MobileRoute } from './mobileNavigation';
import type { RSVPEngine } from '../../engine/rsvpEngine';
import { getSectionPickerOptions } from './mobileSectionPicker';

export interface MobileBottomSheetHandle {
	destroy(): void;
	open(): void;
	close(): void;
	isOpen(): boolean;
	onOpenChange(cb: (open: boolean) => void): void;
}

const MORE_LINKS: { route: MobileRoute; label: string }[] = [
	{ route: 'content', label: 'Content' },
	{ route: 'settings', label: 'Settings' },
	{ route: 'shortcuts', label: 'Shortcuts' },
	{ route: 'advanced', label: 'Advanced' }
];

const PREFERENCES_MORE_LINKS = MORE_LINKS.filter(
	(link) => link.route === 'settings' || link.route === 'advanced'
);

export function mountMobileBottomSheet(
	shellEl: HTMLElement,
	engine: RSVPEngine,
	options: {
		preferencesOnly?: boolean;
		onPushRoute: (route: MobileRoute) => void;
		onChapterSelect: (sectionId: string) => void;
	}
): MobileBottomSheetHandle {
	const root = shellEl.createDiv({ cls: 'speed-reader-ai-mobile-sheet-root' });
	const fab = root.createEl('button', {
		cls: 'speed-reader-ai-mobile-fab',
		text: '☰',
		attr: { type: 'button', 'aria-label': 'Open menu' }
	});

	const backdrop = root.createDiv({ cls: 'speed-reader-ai-mobile-sheet-backdrop is-hidden' });
	const sheet = root.createDiv({ cls: 'speed-reader-ai-mobile-sheet is-hidden' });
	const bodyHost = sheet.createDiv({ cls: 'speed-reader-ai-mobile-sheet-body' });

	const chapterSection = bodyHost.createDiv({ cls: 'speed-reader-ai-mobile-sheet-chapters' });
	const chapterTitle = chapterSection.createDiv({
		cls: 'speed-reader-ai-mobile-sheet-section-title',
		text: 'Jump to chapter'
	});
	const chapterList = chapterSection.createDiv({ cls: 'speed-reader-ai-mobile-sheet-chapter-list' });

	const moreSection = bodyHost.createDiv({ cls: 'speed-reader-ai-mobile-sheet-more is-hidden' });
	const moreTitle = moreSection.createDiv({
		cls: 'speed-reader-ai-mobile-sheet-section-title',
		text: 'More'
	});
	const moreList = moreSection.createDiv({ cls: 'speed-reader-ai-mobile-sheet-more-list' });

	let open = false;
	const openListeners: Array<(open: boolean) => void> = [];
	const moreLinks = options.preferencesOnly ? PREFERENCES_MORE_LINKS : MORE_LINKS;

	for (const link of moreLinks) {
		const btn = moreList.createEl('button', {
			cls: 'speed-reader-ai-mobile-sheet-more-btn',
			text: link.label,
			attr: { type: 'button' }
		});
		btn.addEventListener('click', () => {
			options.onPushRoute(link.route);
			closeSheet();
		});
	}

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
		moreSection.toggleClass('is-hidden', moreLinks.length === 0);
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

	fab.addEventListener('click', () => {
		if (open) {
			closeSheet();
		} else {
			openSheet();
		}
	});

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
