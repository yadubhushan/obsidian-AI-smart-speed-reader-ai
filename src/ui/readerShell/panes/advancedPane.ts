import type { SpeedReaderAiSettings } from '../../../types';
import { MOBILE_ROUTE_LABELS } from '../mobileNavigation';
import { mountMobileStackChrome, type MobileStackChromeHandle } from '../mobileStackChrome';

export interface AdvancedPaneOptions {
	isMobile?: boolean;
}

export interface AdvancedPaneHandle {
	destroy(): void;
	refresh(settings: SpeedReaderAiSettings): void;
	onSwipeBack(cb: () => void): void;
}

export function mountAdvancedPane(
	container: HTMLElement,
	settings: SpeedReaderAiSettings,
	handlers: {
		onSave: (settings: SpeedReaderAiSettings) => void;
		isMobile?: boolean;
	}
): AdvancedPaneHandle {
	const isMobile = handlers.isMobile ?? false;
	const pane = container.createDiv({ cls: 'speed-reader-ai-pane speed-reader-ai-pane-advanced is-hidden' });
	let stackChrome: MobileStackChromeHandle | null = null;
	let bodyHost: HTMLElement = pane;
	if (isMobile) {
		stackChrome = mountMobileStackChrome(pane, {
			title: MOBILE_ROUTE_LABELS.advanced,
			scrollEl: pane,
			ignoreSwipeSelectors: '.speed-reader-ai-settings-actions'
		});
		bodyHost = pane.createDiv({ cls: 'speed-reader-ai-mobile-stack-body' });
	}
	let draft = structuredClone(settings);

	const render = () => {
		bodyHost.empty();
		if (!isMobile) {
			bodyHost.createEl('h3', { text: 'Advanced settings' });
		}
		bodyHost.createEl('p', {
			cls: 'speed-reader-ai-pane-hint',
			text: 'LLM backend, API keys, and prepare limits are in Settings → Community plugins → Speed Reader AI.'
		});

		const section = (title: string) => bodyHost.createEl('h4', { text: title });

		section('Pacing');
		const micropauseRow = bodyHost.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const micropauseCheck = micropauseRow.createEl('input', { attr: { type: 'checkbox' } });
		micropauseCheck.checked = draft.reader.enableMicropause;
		micropauseRow.createSpan({ text: 'Enable micropause' });
		bodyHost.createEl('label', { text: 'Micropause intensity (1–3)' });
		const intensityInput = bodyHost.createEl('input', {
			cls: 'speed-reader-ai-settings-input',
			attr: { type: 'number', min: '1', max: '3', step: '0.1' }
		});
		intensityInput.value = String(draft.reader.micropauseIntensity);

		bodyHost.createEl('label', { text: 'Line repeat gap (ms)' });
		const gapInput = bodyHost.createEl('input', {
			cls: 'speed-reader-ai-settings-input',
			attr: { type: 'number', min: '100', max: '3000' }
		});
		gapInput.value = String(draft.reader.lineRepeatGapMs);

		section('Bookmarks');
		bodyHost.createEl('label', { text: 'Book bookmark note template' });
		const bookTemplate = bodyHost.createEl('input', { cls: 'speed-reader-ai-settings-input' });
		bookTemplate.value = draft.bookmarks.bookBookmarkNoteTemplate;
		bodyHost.createEl('label', { text: 'Note bookmark section heading' });
		const noteHeading = bodyHost.createEl('input', { cls: 'speed-reader-ai-settings-input' });
		noteHeading.value = draft.bookmarks.noteBookmarkSectionHeading;

		section('Dictionary');
		const lookupRow = bodyHost.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const lookupCheck = lookupRow.createEl('input', { attr: { type: 'checkbox' } });
		lookupCheck.checked = draft.dictionary.enableWordLookup;
		lookupRow.createSpan({ text: 'Enable word lookup (requires internet)' });
		const cacheRow = bodyHost.createDiv({ cls: 'speed-reader-ai-settings-check-row' });
		const cacheCheck = cacheRow.createEl('input', { attr: { type: 'checkbox' } });
		cacheCheck.checked = draft.dictionary.dictionaryCacheEnabled;
		cacheRow.createSpan({ text: 'Cache definitions for this session' });
		bodyHost.createEl('p', {
			cls: 'speed-reader-ai-pane-hint',
			text: 'Merriam Webster API key: Settings → Community plugins → Speed Reader AI → Dictionary.'
		});

		const actions = bodyHost.createDiv({ cls: 'speed-reader-ai-settings-actions' });
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
					...draft.dictionary,
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
			stackChrome?.destroy();
			pane.remove();
		},
		refresh(next) {
			draft = structuredClone(next);
			render();
		},
		onSwipeBack(cb) {
			stackChrome?.onBack(cb);
		}
	};
}

export function showAdvancedPane(paneEl: HTMLElement, visible: boolean): void {
	paneEl.toggleClass('is-hidden', !visible);
}
