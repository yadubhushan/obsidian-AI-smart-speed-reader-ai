import type { SpeedReaderAiSettings } from '../../types';
import { DictionaryLookupService } from '../../dictionary/dictionaryLookupService';
import { attachReaderWordLookup } from './attachReaderWordLookup';
import type { SpeedReaderAiModal } from '../../speedReaderAiModal';
import type SpeedReaderAiPlugin from '../../main';

let lookupService: DictionaryLookupService | null = null;

function getLookupService(): DictionaryLookupService {
	if (!lookupService) {
		lookupService = new DictionaryLookupService();
	}
	return lookupService;
}

export function registerWordLookup(plugin: SpeedReaderAiPlugin): void {
	plugin.addCommand({
		id: 'speed-reader-lookup-word',
		name: 'Look up current word',
		checkCallback: (checking) => {
			const modal = plugin.getServices().readerGate.getActiveModal();
			if (!modal) {
				return false;
			}
			if (!checking) {
				void modal.getWordLookupHandlers()?.lookupCurrentWord();
			}
			return true;
		}
	});
}

export function wireReaderWordLookup(
	modal: SpeedReaderAiModal,
	getSettings: () => Pick<SpeedReaderAiSettings, 'dictionary'>
): void {
	attachReaderWordLookup({
		modal,
		lookupService: getLookupService(),
		getSettings
	});
}
