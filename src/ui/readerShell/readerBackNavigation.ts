import type { ReaderTabId } from './readerTabDock';

export type ReaderBackAction =
	| 'dismiss-dictionary'
	| 'dismiss-coach-marks'
	| 'close-peek-sheet'
	| 'close-bottom-sheet'
	| 'go-home'
	| 'exit-focus-mode'
	| 'close-modal';

export interface ReaderBackSnapshot {
	activeTab: ReaderTabId;
	preferencesOnly: boolean;
	dictionaryVisible: boolean;
	coachMarksOpen: boolean;
	peekSheetOpen: boolean;
	bottomSheetOpen: boolean;
	focusMode: boolean;
}

export function resolveReaderBackAction(snapshot: ReaderBackSnapshot): ReaderBackAction {
	if (snapshot.dictionaryVisible) {
		return 'dismiss-dictionary';
	}
	if (snapshot.coachMarksOpen) {
		return 'dismiss-coach-marks';
	}
	if (snapshot.peekSheetOpen) {
		return 'close-peek-sheet';
	}
	if (snapshot.bottomSheetOpen) {
		return 'close-bottom-sheet';
	}
	if (snapshot.activeTab !== 'home') {
		return snapshot.preferencesOnly ? 'close-modal' : 'go-home';
	}
	if (snapshot.focusMode) {
		return 'exit-focus-mode';
	}
	return 'close-modal';
}
