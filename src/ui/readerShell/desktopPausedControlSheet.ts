import { setIcon, type IconName } from 'obsidian';
import type { PlaybackMode, ReaderState, SpeedReaderAiSettings } from '../../types';
import type { PrepareUiStatus } from '../prepareControls';
import { mountPlaybackModeSelect } from './playbackModePicker';

export interface DesktopNavigationOption {
	id: string;
	label: string;
}

export interface DesktopPausedControlSheetState {
	readerState: ReaderState | null;
	settings: SpeedReaderAiSettings;
	navigationLabel: string;
	navigationOptions: DesktopNavigationOption[];
	currentNavigationId: string | null;
	canStepNavigation: boolean;
	prepareStatus: PrepareUiStatus;
	showPrepareStatus: boolean;
}

export interface DesktopPausedControlSheetHandle {
	destroy(): void;
	setVisible(visible: boolean): void;
	update(state: DesktopPausedControlSheetState): void;
}

export interface DesktopPausedControlSheetHandlers {
	onPlayPause(): void;
	onWpmDelta(delta: number): void;
	onFontDelta(delta: number): void;
	onPlaybackModeChange(mode: PlaybackMode): void;
	onPreviousSection(): void;
	onNextSection(): void;
	onNavigate(id: string): void;
	onTtsToggle(): void;
	onBookmark(): void;
	onCopyContext(): void | Promise<void>;
	onOpenSetup(): void;
	onOpenContent(): void;
	onOpenBookmarks(): void;
	onOpenShortcuts(): void;
	onOpenSettings(): void;
}

function setButtonContent(button: HTMLButtonElement, icon: IconName, label?: string): void {
	button.empty();
	const iconEl = button.createSpan({ cls: 'speed-reader-ai-adaptive-icon' });
	setIcon(iconEl, icon);
	if (label) {
		button.createSpan({ text: label });
	}
}

function statusLabel(status: PrepareUiStatus): string {
	switch (status) {
		case 'prepared':
			return 'AI prepared';
		case 'stale':
			return 'Stale';
		case 'preparing':
			return 'Preparing';
		case 'error':
			return 'AI error';
		default:
			return 'Local';
	}
}

export function mountDesktopPausedControlSheet(
	container: HTMLElement,
	handlers: DesktopPausedControlSheetHandlers
): DesktopPausedControlSheetHandle {
	const root = container.createDiv({
		cls: 'speed-reader-ai-paused-sheet is-hidden',
		attr: { role: 'region', 'aria-label': 'Reading controls' }
	});

	const navigation = root.createDiv({ cls: 'speed-reader-ai-paused-sheet-navigation' });
	const previousButton = navigation.createEl('button', {
		cls: 'speed-reader-ai-adaptive-icon-button',
		attr: { type: 'button', 'aria-label': 'Previous section', title: 'Previous section' }
	});
	setIcon(previousButton, 'chevron-left');
	const navigationSelect = navigation.createEl('select', {
		cls: 'speed-reader-ai-paused-sheet-section-select',
		attr: { 'aria-label': 'Jump to section' }
	});
	const nextButton = navigation.createEl('button', {
		cls: 'speed-reader-ai-adaptive-icon-button',
		attr: { type: 'button', 'aria-label': 'Next section', title: 'Next section' }
	});
	setIcon(nextButton, 'chevron-right');
	const statusButton = navigation.createEl('button', {
		cls: 'speed-reader-ai-paused-sheet-status',
		attr: { type: 'button', title: 'Open reading setup' }
	});

	const primary = root.createDiv({ cls: 'speed-reader-ai-paused-sheet-primary' });
	const speedGroup = primary.createDiv({
		cls: 'speed-reader-ai-paused-sheet-stepper',
		attr: { role: 'group', 'aria-label': 'Reading speed' }
	});
	const slowerButton = speedGroup.createEl('button', {
		cls: 'speed-reader-ai-adaptive-icon-button',
		attr: { type: 'button', 'aria-label': 'Decrease reading speed', title: 'Decrease reading speed' }
	});
	setIcon(slowerButton, 'minus');
	const wpmValue = speedGroup.createSpan({ cls: 'speed-reader-ai-paused-sheet-wpm' });
	const fasterButton = speedGroup.createEl('button', {
		cls: 'speed-reader-ai-adaptive-icon-button',
		attr: { type: 'button', 'aria-label': 'Increase reading speed', title: 'Increase reading speed' }
	});
	setIcon(fasterButton, 'plus');

	const playButton = primary.createEl('button', {
		cls: 'speed-reader-ai-adaptive-button speed-reader-ai-paused-sheet-play',
		attr: { type: 'button', 'aria-label': 'Play' }
	});
	setButtonContent(playButton, 'play', 'Play');

	const modeHost = primary.createDiv({ cls: 'speed-reader-ai-paused-sheet-mode' });
	const modePicker = mountPlaybackModeSelect(modeHost, {
		className: 'speed-reader-ai-paused-sheet-mode-select',
		ariaLabel: 'Playback mode',
		onChange: (mode) => handlers.onPlaybackModeChange(mode)
	});

	const secondary = root.createDiv({ cls: 'speed-reader-ai-paused-sheet-secondary' });
	const appearanceButton = secondary.createEl('button', {
		cls: 'speed-reader-ai-adaptive-action',
		attr: { type: 'button', 'aria-expanded': 'false' }
	});
	setButtonContent(appearanceButton, 'type', 'Appearance');
	const speechButton = secondary.createEl('button', {
		cls: 'speed-reader-ai-adaptive-action',
		attr: { type: 'button', 'aria-pressed': 'false' }
	});
	setButtonContent(speechButton, 'volume-x', 'Speech');
	const bookmarkButton = secondary.createEl('button', {
		cls: 'speed-reader-ai-adaptive-action',
		attr: { type: 'button' }
	});
	setButtonContent(bookmarkButton, 'bookmark', 'Bookmark');
	const moreButton = secondary.createEl('button', {
		cls: 'speed-reader-ai-adaptive-action',
		attr: { type: 'button', 'aria-expanded': 'false' }
	});
	setButtonContent(moreButton, 'ellipsis', 'More');

	const appearancePanel = root.createDiv({
		cls: 'speed-reader-ai-paused-sheet-panel is-hidden',
		attr: { 'aria-label': 'Appearance controls' }
	});
	appearancePanel.createSpan({ text: 'Font size', cls: 'speed-reader-ai-paused-sheet-panel-label' });
	const fontDown = appearancePanel.createEl('button', {
		cls: 'speed-reader-ai-adaptive-icon-button',
		attr: { type: 'button', 'aria-label': 'Decrease font size' }
	});
	setIcon(fontDown, 'minus');
	const fontValue = appearancePanel.createSpan({ cls: 'speed-reader-ai-paused-sheet-font-value' });
	const fontUp = appearancePanel.createEl('button', {
		cls: 'speed-reader-ai-adaptive-icon-button',
		attr: { type: 'button', 'aria-label': 'Increase font size' }
	});
	setIcon(fontUp, 'plus');

	const morePanel = root.createDiv({
		cls: 'speed-reader-ai-paused-sheet-panel speed-reader-ai-paused-sheet-more is-hidden',
		attr: { 'aria-label': 'More reading actions' }
	});
	const addMoreAction = (icon: IconName, label: string, handler: () => void) => {
		const button = morePanel.createEl('button', {
			cls: 'speed-reader-ai-adaptive-menu-action',
			attr: { type: 'button' }
		});
		setButtonContent(button, icon, label);
		button.addEventListener('click', handler);
		return button;
	};
	addMoreAction('copy', 'Copy context', () => void handlers.onCopyContext());
	addMoreAction('sparkles', 'Reading setup', () => handlers.onOpenSetup());
	addMoreAction('scroll-text', 'Contents', () => handlers.onOpenContent());
	addMoreAction('book-marked', 'Bookmarks', () => handlers.onOpenBookmarks());
	addMoreAction('keyboard', 'Shortcuts', () => handlers.onOpenShortcuts());
	addMoreAction('settings', 'Preferences', () => handlers.onOpenSettings());

	let lastNavigationSignature = '';
	let appearanceOpen = false;
	let moreOpen = false;
	const setAppearanceOpen = (open: boolean) => {
		appearanceOpen = open;
		if (open) {
			moreOpen = false;
		}
		appearancePanel.toggleClass('is-hidden', !appearanceOpen);
		morePanel.toggleClass('is-hidden', !moreOpen);
		appearanceButton.setAttr('aria-expanded', String(appearanceOpen));
		moreButton.setAttr('aria-expanded', String(moreOpen));
	};
	const setMoreOpen = (open: boolean) => {
		moreOpen = open;
		if (open) {
			appearanceOpen = false;
		}
		appearancePanel.toggleClass('is-hidden', !appearanceOpen);
		morePanel.toggleClass('is-hidden', !moreOpen);
		appearanceButton.setAttr('aria-expanded', String(appearanceOpen));
		moreButton.setAttr('aria-expanded', String(moreOpen));
	};

	previousButton.addEventListener('click', () => handlers.onPreviousSection());
	nextButton.addEventListener('click', () => handlers.onNextSection());
	navigationSelect.addEventListener('change', () => {
		if (navigationSelect.value) {
			handlers.onNavigate(navigationSelect.value);
		}
	});
	statusButton.addEventListener('click', () => handlers.onOpenSetup());
	slowerButton.addEventListener('click', () => handlers.onWpmDelta(-25));
	fasterButton.addEventListener('click', () => handlers.onWpmDelta(25));
	playButton.addEventListener('click', () => handlers.onPlayPause());
	appearanceButton.addEventListener('click', () => setAppearanceOpen(!appearanceOpen));
	speechButton.addEventListener('click', () => handlers.onTtsToggle());
	bookmarkButton.addEventListener('click', () => handlers.onBookmark());
	moreButton.addEventListener('click', () => setMoreOpen(!moreOpen));
	fontDown.addEventListener('click', () => handlers.onFontDelta(-3));
	fontUp.addEventListener('click', () => handlers.onFontDelta(3));

	return {
		destroy() {
			modePicker.destroy();
			root.remove();
		},
		setVisible(visible) {
			root.toggleClass('is-hidden', !visible);
			if (!visible) {
				setAppearanceOpen(false);
				setMoreOpen(false);
			}
		},
		update(next) {
			const state = next.readerState;
			previousButton.setAttr('aria-label', `Previous ${next.navigationLabel.toLowerCase()}`);
			previousButton.setAttr('title', `Previous ${next.navigationLabel.toLowerCase()}`);
			nextButton.setAttr('aria-label', `Next ${next.navigationLabel.toLowerCase()}`);
			nextButton.setAttr('title', `Next ${next.navigationLabel.toLowerCase()}`);
			navigationSelect.setAttr('aria-label', `Jump to ${next.navigationLabel.toLowerCase()}`);
			const wpm = Math.round(state?.currentWpm ?? next.settings.reader.wpm);
			wpmValue.setText(`${wpm} WPM`);
			fontValue.setText(`${next.settings.reader.fontSize}px`);
			modePicker.setMode(state?.playbackMode ?? next.settings.reader.defaultPlaybackMode);

			const ttsEnabled = next.settings.reader.ttsEnabled;
			setButtonContent(speechButton, ttsEnabled ? 'volume-2' : 'volume-x', 'Speech');
			speechButton.setAttr('aria-pressed', String(ttsEnabled));
			speechButton.setAttr('aria-label', ttsEnabled ? 'Disable text to speech' : 'Enable text to speech');
			speechButton.toggleClass('is-active', ttsEnabled);

			statusButton.setText(statusLabel(next.prepareStatus));
			statusButton.setAttr('aria-label', `${statusLabel(next.prepareStatus)}. Open reading setup`);
			statusButton.toggleClass('is-warning', next.prepareStatus === 'stale');
			statusButton.toggleClass('is-error', next.prepareStatus === 'error');
			statusButton.toggleClass('is-busy', next.prepareStatus === 'preparing');
			statusButton.toggleClass('is-hidden', !next.showPrepareStatus);

			const signature = next.navigationOptions.map((option) => `${option.id}:${option.label}`).join('|');
			if (signature !== lastNavigationSignature) {
				lastNavigationSignature = signature;
				navigationSelect.empty();
				if (next.navigationOptions.length === 0) {
					navigationSelect.createEl('option', { text: next.navigationLabel, value: '' });
				} else {
					for (const option of next.navigationOptions) {
						navigationSelect.createEl('option', { text: option.label, value: option.id });
					}
				}
			}
			if (next.currentNavigationId) {
				navigationSelect.value = next.currentNavigationId;
			}
			const hasNavigation = next.navigationOptions.length > 0;
			navigationSelect.disabled = !hasNavigation;
			previousButton.disabled = !next.canStepNavigation || (state?.currentSectionIndex ?? 0) <= 0;
			const currentIndex = state?.currentSectionIndex ?? 0;
			nextButton.disabled =
				!next.canStepNavigation || currentIndex >= next.navigationOptions.length - 1;
			navigation.toggleClass('is-hidden', !hasNavigation && next.prepareStatus === 'idle');
		}
	};
}
