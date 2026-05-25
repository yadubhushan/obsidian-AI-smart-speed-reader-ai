import { Notice, type App } from 'obsidian';
import {
	extractLookupWordFromReaderState,
	normalizeWordForLookup
} from '../../dictionary/dictionaryLookup';
import { DictionaryLookupService } from '../../dictionary/dictionaryLookupService';
import type { DictionaryLookupOutcome } from '../../dictionary/dictionaryTypes';
import { saveDictionaryEntry } from '../../dictionary/dictionarySaveService';
import type { DictionarySaveButtonState } from '../../ui/dictionaryFooter';
import { recordStudyLoopDictionaryLookup } from '../../study-loop/studyLoopBridge';
import type { SpeedReaderAiModal } from '../../speedReaderAiModal';
import type { SpeedReaderAiSettings } from '../../types';

export interface ReaderWordLookupHandles {
	lookupCurrentWord: () => void | Promise<void>;
	lookupWord: (rawWord: string) => void | Promise<void>;
	isEnabled: () => boolean;
}

export interface AttachReaderWordLookupDeps {
	app: App;
	modal: SpeedReaderAiModal;
	lookupService: DictionaryLookupService;
	getSettings: () => Pick<SpeedReaderAiSettings, 'dictionary'>;
}

export function attachReaderWordLookup(deps: AttachReaderWordLookupDeps): void {
	const { app, modal, lookupService, getSettings } = deps;
	let lastOutcome: DictionaryLookupOutcome | null = null;

	const setDictionarySaveState = (state: DictionarySaveButtonState) => {
		modal.setDictionarySaveState(state);
	};

	const saveToDictionary = async () => {
		if (lastOutcome?.kind !== 'found') {
			return;
		}

		setDictionarySaveState('saving');
		try {
			const { dictionaryNotePath } = getSettings().dictionary;
			const result = await saveDictionaryEntry(app, dictionaryNotePath, lastOutcome.result);
			if (result.saved) {
				setDictionarySaveState('saved');
				new Notice(`Saved to ${result.path}`);
				return;
			}
			if (result.reason === 'duplicate') {
				setDictionarySaveState('duplicate');
			} else {
				setDictionarySaveState('idle');
			}
		} catch {
			setDictionarySaveState('idle');
			new Notice('Could not save to dictionary.');
		}
	};

	modal.setDictionarySaveHandler(() => saveToDictionary());

	const performLookup = async (rawWord: string) => {
		if (!getSettings().dictionary.enableWordLookup) {
			new Notice('Word lookup is disabled in settings.');
			return;
		}

		lookupService.configure({
			merriamWebsterApiKey: getSettings().dictionary.merriamWebsterApiKey,
			cacheEnabled: getSettings().dictionary.dictionaryCacheEnabled
		});

		const normalized = normalizeWordForLookup(rawWord);
		if (!normalized) {
			new Notice('No dictionary entry for this word.');
			return;
		}

		lastOutcome = null;
		modal.enginePauseForLookup();
		modal.showDictionaryLoading(normalized);

		const outcome = await lookupService.lookup(normalized);
		if (!modal.isDictionaryOverlayVisible()) {
			return;
		}
		lastOutcome = outcome;
		modal.showDictionaryOutcome(outcome);

		const readerOpen = modal.getReaderOpen();
		if (readerOpen.kind === 'structured' || readerOpen.kind === 'book') {
			recordStudyLoopDictionaryLookup(readerOpen.sourcePath, normalized);
		}
	};

	const handles: ReaderWordLookupHandles = {
		isEnabled: () => getSettings().dictionary.enableWordLookup,
		lookupCurrentWord: async () => {
			if (modal.isDictionaryOverlayVisible()) {
				modal.dismissDictionaryOverlay();
				return;
			}

			const rawWord = extractLookupWordFromReaderState(modal.getReaderState());
			if (!rawWord) {
				new Notice('No word available to look up.');
				return;
			}

			await performLookup(rawWord);
		},
		lookupWord: async (rawWord: string) => {
			const trimmed = rawWord.trim();
			if (!trimmed) {
				return;
			}

			await performLookup(trimmed);
		}
	};

	modal.setWordLookupHandlers(handles);
	modal.refreshControlsBar();
}
