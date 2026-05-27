import { Bookmark, Minus, Plus, Settings } from 'lucide-react';
import { appendM4IconToButton, createM4Icon } from './m4Icons';
import { mountTapClassifier } from './m4BookmarkButton';

export interface M4BottomControlsHandle {
	updateWpm(wpm: number): void;
	updateFontSize(fontSize: number): void;
	destroy(): void;
}

export interface M4BottomControlsOptions {
	wpm: number;
	fontSize: number;
	onWpmDelta: (delta: number) => void;
	onFontDelta: (delta: number) => void;
	onBookmarkOnce: () => void;
	onBookmarkExplorer: () => void;
	onOpenSettings: () => void;
}

export function mountM4BottomControls(
	container: HTMLElement,
	options: M4BottomControlsOptions
): M4BottomControlsHandle {
	const root = container.createDiv({ cls: 'speed-reader-m4-bottom-controls speed-reader-m4-chrome' });

	const wpmCard = root.createDiv({ cls: 'speed-reader-m4-control-card speed-reader-m4-control-card--wpm' });
	const wpmMinus = wpmCard.createEl('button', {
		cls: 'speed-reader-m4-control-card__step-btn',
		attr: { type: 'button', 'aria-label': 'Decrease reading speed' }
	});
	appendM4IconToButton(wpmMinus, Minus, {
		className: 'speed-reader-m4-icon speed-reader-m4-icon--sm',
		size: 14
	});
	const wpmCenter = wpmCard.createDiv({ cls: 'speed-reader-m4-control-card__center' });
	const wpmValue = wpmCenter.createSpan({ cls: 'speed-reader-m4-control-card__value' });
	wpmValue.setText(String(options.wpm));
	wpmCenter.createSpan({ text: 'WPM', cls: 'speed-reader-m4-control-card__unit' });
	const wpmPlus = wpmCard.createEl('button', {
		cls: 'speed-reader-m4-control-card__step-btn',
		attr: { type: 'button', 'aria-label': 'Increase reading speed' }
	});
	appendM4IconToButton(wpmPlus, Plus, {
		className: 'speed-reader-m4-icon speed-reader-m4-icon--sm',
		size: 14
	});
	wpmMinus.addEventListener('click', () => options.onWpmDelta(-25));
	wpmPlus.addEventListener('click', () => options.onWpmDelta(25));

	const fontCard = root.createDiv({ cls: 'speed-reader-m4-control-card speed-reader-m4-control-card--font' });
	const fontMinus = fontCard.createEl('button', {
		text: 'A-',
		cls: 'speed-reader-m4-control-card__font-step',
		attr: { type: 'button', 'aria-label': 'Decrease font size' }
	});
	const fontCenter = fontCard.createDiv({ cls: 'speed-reader-m4-control-card__center' });
	fontCenter.createSpan({ text: 'font', cls: 'speed-reader-m4-control-card__unit' });
	const fontValue = fontCenter.createSpan({ cls: 'speed-reader-m4-control-card__value' });
	fontValue.setText(String(options.fontSize));
	const fontPlus = fontCard.createEl('button', {
		text: 'A+',
		cls: 'speed-reader-m4-control-card__font-step',
		attr: { type: 'button', 'aria-label': 'Increase font size' }
	});
	fontMinus.addEventListener('click', () => options.onFontDelta(-3));
	fontPlus.addEventListener('click', () => options.onFontDelta(3));

	const actions = root.createDiv({ cls: 'speed-reader-m4-bottom-actions' });
	const bookmarkBtn = actions.createEl('button', {
		cls: 'speed-reader-m4-action-btn',
		attr: {
			type: 'button',
			'aria-label': 'Bookmark current line',
			title: 'Bookmark current line. Double-tap for bookmark explorer.'
		}
	});
	appendM4IconToButton(bookmarkBtn, Bookmark);
	const settingsBtn = actions.createEl('button', {
		cls: 'speed-reader-m4-action-btn speed-reader-m4-action-btn--settings',
		attr: { type: 'button', 'aria-label': 'Settings' }
	});
	appendM4IconToButton(settingsBtn, Settings);
	settingsBtn.addEventListener('click', () => options.onOpenSettings());

	const tapClassifier = mountTapClassifier(bookmarkBtn, {
		onSingle: () => options.onBookmarkOnce(),
		onDouble: () => options.onBookmarkExplorer()
	});

	return {
		updateWpm(wpm: number) {
			wpmValue.setText(String(wpm));
		},
		updateFontSize(fontSize: number) {
			fontValue.setText(String(fontSize));
		},
		destroy() {
			tapClassifier.destroy();
			root.remove();
		}
	};
}
