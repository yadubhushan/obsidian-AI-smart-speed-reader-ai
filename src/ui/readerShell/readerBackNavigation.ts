import type { ReaderTabId } from './readerTabDock';
import type { MobileRoute } from './mobileNavigation';

export type ReaderBackAction =
	| 'dismiss-dictionary'
	| 'dismiss-coach-marks'
	| 'close-bottom-sheet'
	| 'go-home'
	| 'exit-focus-mode'
	| 'close-modal';

export interface ReaderBackSnapshot {
	activeTab: ReaderTabId;
	mobileRoute: MobileRoute | null;
	preferencesOnly: boolean;
	dictionaryVisible: boolean;
	coachMarksOpen: boolean;
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
	if (snapshot.bottomSheetOpen) {
		return 'close-bottom-sheet';
	}
	const onStackPage =
		snapshot.mobileRoute !== null
			? snapshot.mobileRoute !== 'reading'
			: snapshot.activeTab !== 'home';
	if (onStackPage) {
		return snapshot.preferencesOnly ? 'close-modal' : 'go-home';
	}
	if (snapshot.focusMode) {
		return 'exit-focus-mode';
	}
	return 'close-modal';
}
