export type DictionarySaveButtonState = 'idle' | 'hidden' | 'saving' | 'saved' | 'duplicate';

export interface DictionaryFooterHandle {
	setSaveState(state: DictionarySaveButtonState): void;
	setAttribution(label: string, href: string): void;
}

const SAVE_LABELS: Record<Exclude<DictionarySaveButtonState, 'hidden'>, string> = {
	idle: 'Save to dictionary',
	saving: 'Saving…',
	saved: 'Saved',
	duplicate: 'Already saved'
};

export function mountDictionaryFooter(
	footerEl: HTMLElement,
	options: {
		onDismiss?: () => void;
		onSave?: () => void | Promise<void>;
	}
): DictionaryFooterHandle {
	const attributionEl = footerEl.createEl('a', {
		cls: 'speed-reader-ai-dictionary-attribution',
		text: 'dictionaryapi.dev',
		href: 'https://dictionaryapi.dev/'
	});
	footerEl.createSpan({ text: ' · ' });

	const saveBtn = footerEl.createEl('button', {
		cls: 'speed-reader-ai-btn speed-reader-ai-btn-secondary speed-reader-ai-dictionary-save',
		text: SAVE_LABELS.idle
	});
	saveBtn.addClass('is-hidden');

	footerEl.createSpan({ text: ' · ' });

	const closeBtn = footerEl.createEl('button', {
		cls: 'speed-reader-ai-btn speed-reader-ai-btn-secondary speed-reader-ai-dictionary-close',
		text: 'Close'
	});

	let saveState: DictionarySaveButtonState = 'hidden';
	let resetTimer: number | null = null;

	const clearResetTimer = () => {
		if (resetTimer !== null) {
			window.clearTimeout(resetTimer);
			resetTimer = null;
		}
	};

	const applySaveState = (state: DictionarySaveButtonState) => {
		saveState = state;
		if (state === 'hidden') {
			saveBtn.addClass('is-hidden');
			saveBtn.disabled = true;
			return;
		}

		saveBtn.removeClass('is-hidden');
		saveBtn.disabled = state === 'saving';
		saveBtn.setText(SAVE_LABELS[state]);
	};

	closeBtn.addEventListener('click', () => options.onDismiss?.());

	saveBtn.addEventListener('click', () => {
		if (saveState === 'hidden' || saveState === 'saving') {
			return;
		}
		void options.onSave?.();
	});

	return {
		setSaveState(state: DictionarySaveButtonState) {
			clearResetTimer();
			applySaveState(state);

			if (state === 'saved' || state === 'duplicate') {
				resetTimer = window.setTimeout(() => {
					if (saveState === 'saved' || saveState === 'duplicate') {
						applySaveState('idle');
					}
					resetTimer = null;
				}, 1800);
			}
		},
		setAttribution(label: string, href: string) {
			attributionEl.setText(label);
			attributionEl.setAttr('href', href);
		}
	};
}
