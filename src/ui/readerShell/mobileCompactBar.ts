import type { RSVPEngine } from '../../engine/rsvpEngine';
import type { ReaderState, SpeedReaderAiSettings } from '../../types';

export interface MobileCompactBarHandle {
	destroy(): void;
	update(state: ReaderState | null, settings: SpeedReaderAiSettings): void;
	setChapterNavVisible(visible: boolean): void;
	getChapterPillEl(): HTMLElement | null;
	onChapterPillTap(cb: () => void): void;
}

export interface MobileCompactBarHandlers {
	onWpmDelta: (delta: number) => void;
	onFontDelta: (delta: number) => void;
	onToggleMode: () => void;
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

	const modeBtn = row.createEl('button', {
		cls: 'speed-reader-ai-mobile-touch-btn speed-reader-ai-mobile-mode-btn',
		text: 'RSVP',
		attr: { type: 'button' }
	});

	let chapterPillTapHandler: (() => void) | null = null;

	playBtn.addEventListener('click', () => handlers.onPlayPause());
	modeBtn.addEventListener('click', () => handlers.onToggleMode());
	chapterPill.addEventListener('click', () => chapterPillTapHandler?.());

	return {
		destroy() {
			bar.remove();
		},
		update(state, settings) {
			playBtn.setText(state?.isPlaying ? '⏸' : '▶');
			fontVal.setText(String(settings.reader.fontSize));
			wpmVal.setText(String(state ? Math.round(state.currentWpm) : settings.reader.wpm));
			const isLineRepeat = state?.playbackMode === 'lineRepeat';
			modeBtn.setText(isLineRepeat ? 'Line' : 'RSVP');
			modeBtn.toggleClass('is-line-repeat', isLineRepeat);

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
		setChapterNavVisible(visible) {
			chapterPill.toggleClass('is-hidden', !visible);
		},
		getChapterPillEl: () => chapterPill,
		onChapterPillTap(cb) {
			chapterPillTapHandler = cb;
		}
	};
}

export function getSectionPickerOptions(engine: RSVPEngine): Array<{ id: string; title: string }> {
	const sections = engine.getSectionList();
	if (sections.length > 0) {
		return sections.map((s) => ({ id: s.id, title: s.title }));
	}
	const headings = engine.getStreamHeadings();
	if (headings.length > 0) {
		return headings.map((h) => ({ id: h.title, title: h.title }));
	}
	return engine.getHeadings().map((h) => ({
		id: String(h.wordIndex),
		title: `${'#'.repeat(h.level)} ${h.text}`
	}));
}
