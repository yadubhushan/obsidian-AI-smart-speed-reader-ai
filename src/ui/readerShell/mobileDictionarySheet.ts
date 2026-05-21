import type { DictionaryLookupOutcome } from '../../dictionary/dictionaryTypes';
import { renderDictionaryBody } from '../dictionaryOverlay';

export interface MobileDictionarySheetHandle {
	showLoading(word: string): void;
	showOutcome(outcome: DictionaryLookupOutcome): void;
	dismiss(): void;
	isVisible(): boolean;
	onOpenChange(cb: (open: boolean) => void): void;
	destroy(): void;
}

export function mountMobileDictionarySheet(
	shellEl: HTMLElement,
	onDismiss?: () => void
): MobileDictionarySheetHandle {
	const root = shellEl.createDiv({ cls: 'speed-reader-ai-mobile-dictionary-root' });
	const backdrop = root.createDiv({
		cls: 'speed-reader-ai-mobile-sheet-backdrop speed-reader-ai-mobile-dictionary-backdrop is-hidden'
	});
	const sheet = root.createDiv({
		cls: 'speed-reader-ai-mobile-sheet speed-reader-ai-mobile-dictionary-sheet is-hidden'
	});

	const headerEl = sheet.createDiv({ cls: 'speed-reader-ai-dictionary-header' });
	const wordEl = headerEl.createSpan({ cls: 'speed-reader-ai-dictionary-word' });
	const phoneticEl = headerEl.createSpan({ cls: 'speed-reader-ai-dictionary-phonetic' });
	const bodyEl = sheet.createDiv({ cls: 'speed-reader-ai-dictionary-body' });
	const footerEl = sheet.createDiv({ cls: 'speed-reader-ai-dictionary-footer' });
	footerEl.createEl('a', {
		cls: 'speed-reader-ai-dictionary-attribution',
		text: 'dictionaryapi.dev',
		href: 'https://dictionaryapi.dev/'
	});
	footerEl.createSpan({ text: ' · ' });
	const closeBtn = footerEl.createEl('button', {
		cls: 'speed-reader-ai-btn speed-reader-ai-btn-secondary speed-reader-ai-dictionary-close',
		text: 'Close'
	});

	let visible = false;
	const openListeners: Array<(open: boolean) => void> = [];

	const notifyOpenChange = () => {
		for (const listener of openListeners) {
			listener(visible);
		}
	};

	const dismiss = () => {
		if (!visible) {
			return;
		}
		visible = false;
		backdrop.addClass('is-hidden');
		sheet.addClass('is-hidden');
		root.removeClass('is-sheet-open');
		bodyEl.empty();
		phoneticEl.setText('');
		notifyOpenChange();
		onDismiss?.();
	};

	closeBtn.addEventListener('click', () => onDismiss?.());
	backdrop.addEventListener('click', () => onDismiss?.());

	const showLoading = (word: string) => {
		visible = true;
		backdrop.removeClass('is-hidden');
		sheet.removeClass('is-hidden');
		root.addClass('is-sheet-open');
		wordEl.setText(word);
		phoneticEl.setText('');
		bodyEl.empty();
		bodyEl.createDiv({
			cls: 'speed-reader-ai-dictionary-loading',
			text: 'Looking up…'
		});
		notifyOpenChange();
	};

	const showOutcome = (outcome: DictionaryLookupOutcome) => {
		if (!visible) {
			return;
		}
		if (outcome.kind === 'found') {
			wordEl.setText(outcome.result.word);
			phoneticEl.setText(outcome.result.phonetic ? ` ${outcome.result.phonetic}` : '');
		} else if (outcome.kind === 'not_found') {
			wordEl.setText(outcome.word);
			phoneticEl.setText('');
		} else {
			phoneticEl.setText('');
		}
		renderDictionaryBody(bodyEl, outcome);
	};

	return {
		showLoading,
		showOutcome,
		dismiss,
		isVisible: () => visible,
		onOpenChange(cb) {
			openListeners.push(cb);
		},
		destroy() {
			root.remove();
		}
	};
}
