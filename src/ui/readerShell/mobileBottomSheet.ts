import type { ReaderTabId } from './readerTabDock';
import type { RSVPEngine } from '../../engine/rsvpEngine';
import { getSectionPickerOptions } from './mobileSectionPicker';
import {
	mountMobileReadingControls,
	type MobileReadingControlsHandle
} from './mobileReadingControls';
import type { PlaybackMode, ReaderState, SpeedReaderAiSettings } from '../../types';

export type MobileMenuTabId = 'chapters' | 'reading' | 'settings' | 'advanced';

export interface MobileBottomSheetHandle {
	destroy(): void;
	setActiveTab(tab: ReaderTabId): void;
	open(options?: { initialMenuTab?: MobileMenuTabId }): void;
	close(): void;
	isOpen(): boolean;
	onOpenChange(cb: (open: boolean) => void): void;
	refreshReadingControls(): void;
}

const MOBILE_MENU_TABS: { id: MobileMenuTabId; label: string }[] = [
	{ id: 'chapters', label: 'Chapters' },
	{ id: 'reading', label: 'Reading' },
	{ id: 'settings', label: 'Settings' },
	{ id: 'advanced', label: 'Advanced' }
];

const PREFERENCES_MENU_TABS: MobileMenuTabId[] = ['settings', 'advanced'];

export function mountMobileBottomSheet(
	shellEl: HTMLElement,
	engine: RSVPEngine,
	options: {
		preferencesOnly?: boolean;
		onSelectTab: (tab: ReaderTabId) => void;
		onChapterSelect: (sectionId: string) => void;
		canNavigateSections: () => boolean;
		getSettings: () => SpeedReaderAiSettings;
		getState: () => ReaderState | null;
		onWpmChange: (wpm: number) => void;
		onFontChange: (fontSize: number) => void;
		onPlaybackModeChange: (mode: PlaybackMode) => void;
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
	const bodyHost = sheet.createDiv({ cls: 'speed-reader-ai-mobile-sheet-body' });

	const chapterSection = bodyHost.createDiv({
		cls: 'speed-reader-ai-mobile-sheet-chapters is-hidden'
	});
	const chapterTitle = chapterSection.createDiv({
		cls: 'speed-reader-ai-mobile-sheet-chapters-title',
		text: 'Jump to chapter'
	});
	const chapterList = chapterSection.createDiv({ cls: 'speed-reader-ai-mobile-sheet-chapter-list' });

	const readingSection = bodyHost.createDiv({
		cls: 'speed-reader-ai-mobile-sheet-reading is-hidden'
	});

	let open = false;
	let activeMenuTab: MobileMenuTabId = 'chapters';
	const openListeners: Array<(open: boolean) => void> = [];
	const visibleTabs = options.preferencesOnly
		? MOBILE_MENU_TABS.filter((t) => PREFERENCES_MENU_TABS.includes(t.id))
		: MOBILE_MENU_TABS;
	const tabButtons = new Map<MobileMenuTabId, HTMLButtonElement>();

	let readingControls: MobileReadingControlsHandle | null = null;
	if (!options.preferencesOnly) {
		readingControls = mountMobileReadingControls(readingSection, {
			getSettings: options.getSettings,
			getState: options.getState,
			onWpmChange: options.onWpmChange,
			onFontChange: options.onFontChange,
			onPlaybackModeChange: options.onPlaybackModeChange
		});
	}

	for (const tab of visibleTabs) {
		const btn = tabRow.createEl('button', {
			cls: `speed-reader-ai-mobile-sheet-tab${tab.id === activeMenuTab ? ' is-active' : ''}`,
			text: tab.label,
			attr: { type: 'button', 'data-tab': tab.id }
		});
		btn.addEventListener('click', () => {
			selectMenuTab(tab.id);
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
		chapterSection.removeClass('is-hidden');
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

	function showMenuPanel(tab: MobileMenuTabId) {
		activeMenuTab = tab;
		for (const [id, btn] of tabButtons) {
			btn.toggleClass('is-active', id === tab);
		}
		chapterSection.toggleClass('is-hidden', tab !== 'chapters');
		readingSection.toggleClass('is-hidden', tab !== 'reading');
		if (tab === 'chapters') {
			rebuildChapterList();
			chapterTitle.setText(
				engine.getSectionList().length > 0 ? 'Jump to chapter' : 'Jump to section'
			);
		}
		if (tab === 'reading') {
			readingControls?.refresh();
		}
	}

	function selectMenuTab(tab: MobileMenuTabId) {
		if (tab === 'settings') {
			options.onSelectTab('settings');
			closeSheet();
			return;
		}
		if (tab === 'advanced') {
			options.onSelectTab('advanced');
			closeSheet();
			return;
		}
		showMenuPanel(tab);
	}

	function openSheet(sheetOptions?: { initialMenuTab?: MobileMenuTabId }) {
		if (open) {
			if (sheetOptions?.initialMenuTab) {
				selectMenuTab(sheetOptions.initialMenuTab);
			}
			return;
		}
		open = true;
		backdrop.removeClass('is-hidden');
		sheet.removeClass('is-hidden');
		root.addClass('is-sheet-open');
		const initialTab = sheetOptions?.initialMenuTab ?? 'chapters';
		if (initialTab === 'settings' || initialTab === 'advanced') {
			selectMenuTab(initialTab);
		} else {
			showMenuPanel(initialTab);
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
		readingSection.addClass('is-hidden');
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
			readingControls?.destroy();
			root.remove();
		},
		setActiveTab(tab) {
			if (tab === 'settings' || tab === 'advanced') {
				activeMenuTab = tab;
				for (const [id, btn] of tabButtons) {
					btn.toggleClass('is-active', id === tab);
				}
			}
		},
		open: openSheet,
		close: closeSheet,
		isOpen: () => open,
		onOpenChange(cb) {
			openListeners.push(cb);
		},
		refreshReadingControls() {
			readingControls?.refresh();
		}
	};
}
