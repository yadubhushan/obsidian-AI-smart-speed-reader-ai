import type { PlaybackMode, ReaderState, SpeedReaderAiSettings } from '../../types';
import { mountPlaybackModeSelect } from './playbackModePicker';

export { getSectionPickerOptions } from './mobileSectionPicker';

export interface MobileCompactBarHandle {
	destroy(): void;
	update(state: ReaderState | null, settings: SpeedReaderAiSettings): void;
	setVisible(visible: boolean): void;
	setChapterNavVisible(visible: boolean): void;
	getRootEl(): HTMLElement;
	getChapterPillEl(): HTMLElement | null;
	onChapterPillTap(cb: () => void): void;
	onClose(cb: () => void): void;
}

export interface MobileCompactBarHandlers {
	onWpmDelta: (delta: number) => void;
	onFontDelta: (delta: number) => void;
	onPlaybackModeChange: (mode: PlaybackMode) => void;
	onPlayPause: () => void;
}

export function mountMobileCompactBar(
	container: HTMLElement,
	handlers: MobileCompactBarHandlers
): MobileCompactBarHandle {
	const bar = container.createDiv({ cls: 'speed-reader-ai-mobile-compact-bar' });

	const top = bar.createDiv({ cls: 'speed-reader-ai-mobile-compact-top' });
	const playBtn = top.createEl('button', {
		cls: 'speed-reader-ai-mobile-compact-play',
		text: '▶',
		attr: { type: 'button', 'aria-label': 'Play or pause' }
	});

	const chapterPill = top.createEl('button', {
		cls: 'speed-reader-ai-mobile-chapter-pill is-hidden',
		text: 'Chapter',
		attr: { type: 'button' }
	});

	const closeBtn = top.createEl('button', {
		cls: 'speed-reader-ai-mobile-compact-close',
		text: '✕',
		attr: { type: 'button', 'aria-label': 'Close reader' }
	});

	const row = bar.createDiv({ cls: 'speed-reader-ai-mobile-compact-row' });

	const fontGroup = row.createDiv({ cls: 'speed-reader-ai-mobile-compact-group' });
	fontGroup.createEl('button', {
		cls: 'speed-reader-ai-mobile-touch-btn',
		text: 'A−',
		attr: { type: 'button', 'aria-label': 'Decrease font size' }
	}).addEventListener('click', () => handlers.onFontDelta(-3));
	const fontVal = fontGroup.createSpan({ cls: 'speed-reader-ai-mobile-compact-value' });
	fontGroup.createEl('button', {
		cls: 'speed-reader-ai-mobile-touch-btn',
		text: 'A+',
		attr: { type: 'button', 'aria-label': 'Increase font size' }
	}).addEventListener('click', () => handlers.onFontDelta(3));

	const wpmGroup = row.createDiv({ cls: 'speed-reader-ai-mobile-compact-group' });
	wpmGroup.createEl('button', {
		cls: 'speed-reader-ai-mobile-touch-btn',
		text: '−',
		attr: { type: 'button', 'aria-label': 'Decrease WPM' }
	}).addEventListener('click', () => handlers.onWpmDelta(-25));
	const wpmVal = wpmGroup.createSpan({ cls: 'speed-reader-ai-mobile-compact-value' });
	wpmGroup.createEl('button', {
		cls: 'speed-reader-ai-mobile-touch-btn',
		text: '+',
		attr: { type: 'button', 'aria-label': 'Increase WPM' }
	}).addEventListener('click', () => handlers.onWpmDelta(25));

	const modeGroup = row.createDiv({ cls: 'speed-reader-ai-mobile-compact-group speed-reader-ai-mobile-compact-mode-group' });
	const modePicker = mountPlaybackModeSelect(modeGroup, {
		className: 'speed-reader-ai-mobile-compact-mode-select',
		ariaLabel: 'Playback mode',
		onChange: handlers.onPlaybackModeChange
	});

	let chapterPillTapHandler: (() => void) | null = null;
	let closeHandler: (() => void) | null = null;

	playBtn.addEventListener('click', () => handlers.onPlayPause());
	chapterPill.addEventListener('click', () => chapterPillTapHandler?.());
	closeBtn.addEventListener('click', () => closeHandler?.());

	return {
		destroy() {
			modePicker.destroy();
			bar.remove();
		},
		update(state, settings) {
			playBtn.setText(state?.isPlaying ? '⏸' : '▶');
			fontVal.setText(String(settings.reader.fontSize));
			wpmVal.setText(String(state ? Math.round(state.currentWpm) : settings.reader.wpm));
			modePicker.setMode(state?.playbackMode ?? settings.reader.defaultPlaybackMode);

			if (state?.sectionTitle?.trim()) {
				const n = (state.currentSectionIndex ?? 0) + 1;
				const m = state.sectionCount ?? 0;
				const title = state.sectionTitle.trim();
				chapterPill.setText(m > 0 ? `${n}/${m} · ${title}` : title);
			} else if (state?.currentHeading) {
				chapterPill.setText(state.currentHeading.text);
			} else {
				chapterPill.setText('Section');
			}
		},
		setVisible(visible) {
			bar.toggleClass('is-hidden', !visible);
		},
		getRootEl() {
			return bar;
		},
		setChapterNavVisible(visible) {
			chapterPill.toggleClass('is-hidden', !visible);
		},
		getChapterPillEl: () => chapterPill,
		onChapterPillTap(cb) {
			chapterPillTapHandler = cb;
		},
		onClose(cb) {
			closeHandler = cb;
		}
	};
}
