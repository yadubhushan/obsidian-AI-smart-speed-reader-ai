import type { SpeedReaderAiSettings } from '../../../types';

export interface AdvancedPaneHandle {
	destroy(): void;
	refresh(settings: SpeedReaderAiSettings): void;
}

export function mountAdvancedPane(
	container: HTMLElement,
	settings: SpeedReaderAiSettings,
	handlers: {
		onSave: (settings: SpeedReaderAiSettings) => void;
	}
): AdvancedPaneHandle {
	const pane = container.createDiv({ cls: 'speed-reader-ai-pane speed-reader-ai-pane-advanced is-hidden' });
	let draft = structuredClone(settings);

	const render = () => {
		pane.empty();
		pane.createEl('h3', { text: 'Advanced settings' });
		pane.createEl('p', {
			cls: 'speed-reader-ai-pane-hint',
			text: 'LLM backend, API keys, and prepare limits are in Settings → Community plugins → Speed Reader AI.'
		});

		const section = (title: string) => pane.createEl('h4', { text: title });

		section('Pacing');
		const micropauseRow = pane.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const micropauseCheck = micropauseRow.createEl('input', { attr: { type: 'checkbox' } });
		micropauseCheck.checked = draft.reader.enableMicropause;
		micropauseRow.createSpan({ text: 'Enable micropause' });
		pane.createEl('label', { text: 'Micropause intensity (1–3)' });
		const intensityInput = pane.createEl('input', {
			cls: 'speed-reader-ai-settings-input',
			attr: { type: 'number', min: '1', max: '3', step: '0.1' }
		});
		intensityInput.value = String(draft.reader.micropauseIntensity);

		pane.createEl('label', { text: 'Line repeat gap (ms)' });
		const gapInput = pane.createEl('input', {
			cls: 'speed-reader-ai-settings-input',
			attr: { type: 'number', min: '100', max: '3000' }
		});
		gapInput.value = String(draft.reader.lineRepeatGapMs);

		section('Bookmarks');
		pane.createEl('label', { text: 'Book bookmark note template' });
		const bookTemplate = pane.createEl('input', { cls: 'speed-reader-ai-settings-input' });
		bookTemplate.value = draft.bookmarks.bookBookmarkNoteTemplate;
		pane.createEl('label', { text: 'Note bookmark section heading' });
		const noteHeading = pane.createEl('input', { cls: 'speed-reader-ai-settings-input' });
		noteHeading.value = draft.bookmarks.noteBookmarkSectionHeading;

		section('Dictionary');
		const lookupRow = pane.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const lookupCheck = lookupRow.createEl('input', { attr: { type: 'checkbox' } });
		lookupCheck.checked = draft.dictionary.enableWordLookup;
		lookupRow.createSpan({ text: 'Enable word lookup (requires internet)' });
		const cacheRow = pane.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const cacheCheck = cacheRow.createEl('input', { attr: { type: 'checkbox' } });
		cacheCheck.checked = draft.dictionary.dictionaryCacheEnabled;
		cacheRow.createSpan({ text: 'Cache definitions for this session' });

		const actions = pane.createDiv({ cls: 'speed-reader-ai-settings-actions' });
		const saveBtn = actions.createEl('button', {
			cls: 'speed-reader-ai-settings-action-btn',
			text: 'Save advanced settings'
		});

		saveBtn.addEventListener('click', () => {
			draft = {
				...draft,
				reader: {
					...draft.reader,
					enableMicropause: micropauseCheck.checked,
					micropauseIntensity: Number(intensityInput.value),
					lineRepeatGapMs: Number(gapInput.value)
				},
				bookmarks: {
					bookBookmarkNoteTemplate: bookTemplate.value,
					noteBookmarkSectionHeading: noteHeading.value
				},
				dictionary: {
					enableWordLookup: lookupCheck.checked,
					dictionaryCacheEnabled: cacheCheck.checked
				}
			};
			handlers.onSave(draft);
		});
	};

	render();

	return {
		destroy() {
			pane.remove();
		},
		refresh(next) {
			draft = structuredClone(next);
			render();
		}
	};
}

export function showAdvancedPane(paneEl: HTMLElement, visible: boolean): void {
	paneEl.toggleClass('is-hidden', !visible);
}
