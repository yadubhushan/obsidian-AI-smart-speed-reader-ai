import { describe, expect, it } from 'vitest';
import {
	resolveReaderBackAction,
	type ReaderBackSnapshot
} from '../src/ui/readerShell/readerBackNavigation';

function snapshot(overrides: Partial<ReaderBackSnapshot> = {}): ReaderBackSnapshot {
	return {
		activeTab: 'home',
		preferencesOnly: false,
		dictionaryVisible: false,
		coachMarksOpen: false,
		peekSheetOpen: false,
		bottomSheetOpen: false,
		focusMode: false,
		...overrides
	};
}

describe('resolveReaderBackAction', () => {
	it('prioritizes dictionary over other layers', () => {
		expect(
			resolveReaderBackAction(
				snapshot({
					dictionaryVisible: true,
					activeTab: 'settings',
					bottomSheetOpen: true
				})
			)
		).toBe('dismiss-dictionary');
	});

	it('dismisses coach marks before peek sheet', () => {
		expect(
			resolveReaderBackAction(
				snapshot({ coachMarksOpen: true, peekSheetOpen: true })
			)
		).toBe('dismiss-coach-marks');
	});

	it('closes peek sheet before bottom sheet', () => {
		expect(
			resolveReaderBackAction(
				snapshot({ peekSheetOpen: true, bottomSheetOpen: true })
			)
		).toBe('close-peek-sheet');
	});

	it('closes bottom sheet when open on home', () => {
		expect(resolveReaderBackAction(snapshot({ bottomSheetOpen: true }))).toBe(
			'close-bottom-sheet'
		);
	});

	it('returns go-home from settings while reading', () => {
		expect(resolveReaderBackAction(snapshot({ activeTab: 'settings' }))).toBe('go-home');
	});

	it('returns go-home from content shortcuts and advanced tabs', () => {
		expect(resolveReaderBackAction(snapshot({ activeTab: 'content' }))).toBe('go-home');
		expect(resolveReaderBackAction(snapshot({ activeTab: 'shortcuts' }))).toBe('go-home');
		expect(resolveReaderBackAction(snapshot({ activeTab: 'advanced' }))).toBe('go-home');
	});

	it('returns go-home from bookmarks explorer', () => {
		expect(resolveReaderBackAction(snapshot({ activeTab: 'bookmarks' }))).toBe('go-home');
	});

	it('closes preferences-only modal from non-home tab', () => {
		expect(
			resolveReaderBackAction(
				snapshot({ activeTab: 'settings', preferencesOnly: true })
			)
		).toBe('close-modal');
	});

	it('exits focus mode on home before closing modal', () => {
		expect(resolveReaderBackAction(snapshot({ focusMode: true }))).toBe('exit-focus-mode');
	});

	it('closes modal from home with no overlays', () => {
		expect(resolveReaderBackAction(snapshot())).toBe('close-modal');
	});
});
