import {
	READER_TABS,
	type ReaderTabId
} from './readerTabDock';
import type { RSVPEngine } from '../../engine/rsvpEngine';
import { getSectionPickerOptions } from './mobileCompactBar';

export interface MobileBottomSheetHandle {
	destroy(): void;
	setActiveTab(tab: ReaderTabId): void;
	open(options?: { showChapterPicker?: boolean }): void;
	close(): void;
	isOpen(): boolean;
	onOpenChange(cb: (open: boolean) => void): void;
}

const PREFERENCES_TABS = new Set<ReaderTabId>(['settings', 'shortcuts', 'advanced']);

export function mountMobileBottomSheet(
	shellEl: HTMLElement,
	engine: RSVPEngine,
	options: {
		preferencesOnly?: boolean;
		initialTab: ReaderTabId;
		onSelectTab: (tab: ReaderTabId) => void;
		onChapterSelect: (sectionId: string) => void;
		canNavigateSections: () => boolean;
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
	const tabRow = sheet.createDiv({ cls: 'speed-reader-ai-mobile-sheet-tabs' });
	const chapterSection = sheet.createDiv({
		cls: 'speed-reader-ai-mobile-sheet-chapters is-hidden'
	});
	const chapterTitle = chapterSection.createDiv({
		cls: 'speed-reader-ai-mobile-sheet-chapters-title',
		text: 'Jump to chapter'
	});
	const chapterList = chapterSection.createDiv({ cls: 'speed-reader-ai-mobile-sheet-chapter-list' });

	let open = false;
	let activeTab = options.initialTab;
	const openListeners: Array<(open: boolean) => void> = [];
	const visibleTabs = options.preferencesOnly
		? READER_TABS.filter((t) => PREFERENCES_TABS.has(t.id))
		: READER_TABS;
	const tabButtons = new Map<ReaderTabId, HTMLButtonElement>();

	for (const tab of visibleTabs) {
		const btn = tabRow.createEl('button', {
			cls: `speed-reader-ai-mobile-sheet-tab${tab.id === activeTab ? ' is-active' : ''}`,
			text: tab.label,
			attr: { type: 'button', 'data-tab': tab.id }
		});
		btn.addEventListener('click', () => {
			selectTab(tab.id);
		});
		tabButtons.set(tab.id, btn);
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

	function selectTab(tab: ReaderTabId) {
		activeTab = tab;
		for (const [id, btn] of tabButtons) {
			btn.toggleClass('is-active', id === tab);
		}
		options.onSelectTab(tab);
		closeSheet();
	}

	function openSheet(sheetOptions?: { showChapterPicker?: boolean }) {
		if (open) {
			return;
		}
		open = true;
		backdrop.removeClass('is-hidden');
		sheet.removeClass('is-hidden');
		root.addClass('is-sheet-open');
		if (sheetOptions?.showChapterPicker && options.canNavigateSections()) {
			rebuildChapterList();
			chapterSection.removeClass('is-hidden');
			chapterTitle.setText(
				engine.getSectionList().length > 0 ? 'Jump to chapter' : 'Jump to section'
			);
		} else {
			chapterSection.addClass('is-hidden');
		}
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
		chapterSection.addClass('is-hidden');
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
		setActiveTab(tab) {
			activeTab = tab;
			for (const [id, btn] of tabButtons) {
				btn.toggleClass('is-active', id === tab);
			}
		},
		open: openSheet,
		close: closeSheet,
		isOpen: () => open,
		onOpenChange(cb) {
			openListeners.push(cb);
		}
	};
}
