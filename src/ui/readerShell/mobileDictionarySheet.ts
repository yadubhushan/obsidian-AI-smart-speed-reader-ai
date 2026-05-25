import type { DictionaryLookupOutcome } from '../../dictionary/dictionaryTypes';
import { mountDictionaryFooter, type DictionaryFooterHandle, type DictionarySaveButtonState } from '../dictionaryFooter';
import { renderDictionaryBody } from '../dictionaryOverlay';

export const DICTIONARY_BACKDROP_DISMISS_GRACE_MS = 350;

export function shouldIgnoreBackdropDismiss(
	openedAt: number,
	now: number,
	graceMs = DICTIONARY_BACKDROP_DISMISS_GRACE_MS
): boolean {
	return openedAt > 0 && now - openedAt < graceMs;
}

export interface MobileDictionarySheetHandle {
	showLoading(word: string): void;
	showOutcome(outcome: DictionaryLookupOutcome): void;
	dismiss(): void;
	isVisible(): boolean;
	onOpenChange(cb: (open: boolean) => void): void;
	setSaveHandler(handler: (() => void | Promise<void>) | null): void;
	setSaveState(state: DictionarySaveButtonState): void;
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

	let visible = false;
	let openedAt = 0;
	let saveHandler: (() => void | Promise<void>) | null = null;
	const openListeners: Array<(open: boolean) => void> = [];
	let footer: DictionaryFooterHandle;

	footer = mountDictionaryFooter(footerEl, {
		onDismiss,
		onSave: () => saveHandler?.()
	});

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
		openedAt = 0;
		backdrop.addClass('is-hidden');
		sheet.addClass('is-hidden');
		root.removeClass('is-sheet-open');
		bodyEl.empty();
		phoneticEl.setText('');
		footer.setSaveState('hidden');
		notifyOpenChange();
		onDismiss?.();
	};

	backdrop.addEventListener('click', () => {
		if (shouldIgnoreBackdropDismiss(openedAt, Date.now())) {
			return;
		}
		onDismiss?.();
	});

	const showLoading = (word: string) => {
		visible = true;
		openedAt = Date.now();
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
		footer.setSaveState('hidden');
		notifyOpenChange();
	};

	const showOutcome = (outcome: DictionaryLookupOutcome) => {
		if (!visible) {
			return;
		}
		if (outcome.kind === 'found') {
			wordEl.setText(outcome.result.word);
			phoneticEl.setText(outcome.result.phonetic ? ` ${outcome.result.phonetic}` : '');
			footer.setAttribution(outcome.result.attribution.label, outcome.result.attribution.href);
			footer.setSaveState('idle');
		} else if (outcome.kind === 'not_found') {
			wordEl.setText(outcome.word);
			phoneticEl.setText('');
			footer.setSaveState('hidden');
		} else {
			phoneticEl.setText('');
			footer.setSaveState('hidden');
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
		setSaveHandler(handler) {
			saveHandler = handler;
		},
		setSaveState(state: DictionarySaveButtonState) {
			footer.setSaveState(state);
		},
		destroy() {
			root.remove();
		}
	};
}
