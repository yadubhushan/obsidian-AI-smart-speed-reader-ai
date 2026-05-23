import { Notice } from 'obsidian';
import {
	extractLookupWordFromReaderState,
	normalizeWordForLookup
} from '../../dictionary/dictionaryLookup';
import { DictionaryLookupService } from '../../dictionary/dictionaryLookupService';
import type { SpeedReaderAiModal } from '../../speedReaderAiModal';
import type { SpeedReaderAiSettings } from '../../types';

export interface ReaderWordLookupHandles {
	lookupCurrentWord: () => void | Promise<void>;
	lookupWord: (rawWord: string) => void | Promise<void>;
	isEnabled: () => boolean;
}

export interface AttachReaderWordLookupDeps {
	modal: SpeedReaderAiModal;
	lookupService: DictionaryLookupService;
	getSettings: () => Pick<SpeedReaderAiSettings, 'dictionary'>;
}

export function attachReaderWordLookup(deps: AttachReaderWordLookupDeps): void {
	const { modal, lookupService, getSettings } = deps;

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
			new Notice('Cannot look up this token.');
			return;
		}

		modal.enginePauseForLookup();
		modal.showDictionaryLoading(normalized);

		const outcome = await lookupService.lookup(rawWord);
		if (!modal.isDictionaryOverlayVisible()) {
			return;
		}
		modal.showDictionaryOutcome(outcome);
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
