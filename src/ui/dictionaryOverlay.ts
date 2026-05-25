import type { DictionaryLookupOutcome, DictionaryResult } from '../dictionary/dictionaryTypes';
import { mountDictionaryFooter, type DictionaryFooterHandle, type DictionarySaveButtonState } from './dictionaryFooter';

export interface DictionaryOverlayHandle {
	showLoading(word: string): void;
	showOutcome(outcome: DictionaryLookupOutcome): void;
	dismiss(): void;
	isVisible(): boolean;
	setSaveHandler(handler: (() => void | Promise<void>) | null): void;
	setSaveState(state: DictionarySaveButtonState): void;
}

export function renderDictionaryBody(
	bodyEl: HTMLElement,
	outcome: DictionaryLookupOutcome
): void {
	bodyEl.empty();
	if (outcome.kind === 'found') {
		renderResult(bodyEl, outcome.result);
		return;
	}
	if (outcome.kind === 'not_found') {
		bodyEl.createDiv({
			cls: 'speed-reader-ai-dictionary-empty',
			text: 'No definition found.'
		});
		return;
	}
	bodyEl.createDiv({
		cls: 'speed-reader-ai-dictionary-empty',
		text: outcome.message
	});
}

export function mountDictionaryOverlay(
	container: HTMLElement,
	onDismiss?: () => void
): DictionaryOverlayHandle {
	const root = container.createDiv({ cls: 'speed-reader-ai-dictionary-overlay is-hidden' });
	const headerEl = root.createDiv({ cls: 'speed-reader-ai-dictionary-header' });
	const wordEl = headerEl.createSpan({ cls: 'speed-reader-ai-dictionary-word' });
	const phoneticEl = headerEl.createSpan({ cls: 'speed-reader-ai-dictionary-phonetic' });
	const bodyEl = root.createDiv({ cls: 'speed-reader-ai-dictionary-body' });
	const footerEl = root.createDiv({ cls: 'speed-reader-ai-dictionary-footer' });

	let visible = false;
	let saveHandler: (() => void | Promise<void>) | null = null;
	let footer: DictionaryFooterHandle;

	footer = mountDictionaryFooter(footerEl, {
		onDismiss,
		onSave: () => saveHandler?.()
	});

	const setHostOpen = (open: boolean) => {
		container.toggleClass('is-dictionary-open', open);
	};

	const dismiss = () => {
		if (!visible) {
			return;
		}
		visible = false;
		setHostOpen(false);
		root.addClass('is-hidden');
		bodyEl.empty();
		phoneticEl.setText('');
		footer.setSaveState('hidden');
	};

	const showLoading = (word: string) => {
		visible = true;
		setHostOpen(true);
		root.removeClass('is-hidden');
		wordEl.setText(word);
		phoneticEl.setText('');
		bodyEl.empty();
		bodyEl.createDiv({
			cls: 'speed-reader-ai-dictionary-loading',
			text: 'Looking up…'
		});
		footer.setSaveState('hidden');
	};

	const showOutcome = (outcome: DictionaryLookupOutcome) => {
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
		setSaveHandler(handler) {
			saveHandler = handler;
		},
		setSaveState(state: DictionarySaveButtonState) {
			footer.setSaveState(state);
		}
	};
}

function renderResult(bodyEl: HTMLElement, result: DictionaryResult) {
	for (const meaning of result.meanings) {
		const block = bodyEl.createDiv({ cls: 'speed-reader-ai-dictionary-meaning' });
		block.createSpan({
			cls: 'speed-reader-ai-dictionary-pos',
			text: meaning.partOfSpeech
		});
		const list = block.createEl('ul', { cls: 'speed-reader-ai-dictionary-definitions' });
		for (const definition of meaning.definitions) {
			const item = list.createEl('li');
			item.createSpan({
				cls: 'speed-reader-ai-dictionary-definition',
				text: definition.text
			});
			if (definition.example) {
				item.createEl('div', {
					cls: 'speed-reader-ai-dictionary-example',
					text: `"${definition.example}"`
				});
			}
		}
	}
}
