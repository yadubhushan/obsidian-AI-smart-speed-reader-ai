import { describe, expect, it } from 'vitest';
import {
	resolveVisibilityAction,
	type FocusEventKind,
	type VisibilityAction
} from '../src/ui/readerShell/readerFocusController';

interface Row {
	event: FocusEventKind;
	docHidden: boolean;
	isPlaying: boolean;
	wasPausedByBlur: boolean;
	expected: VisibilityAction;
}

const table: Row[] = [
	// App goes to background: pause only if playing.
	{ event: 'visibilitychange', docHidden: true, isPlaying: true, wasPausedByBlur: false, expected: 'pause' },
	{ event: 'visibilitychange', docHidden: true, isPlaying: false, wasPausedByBlur: false, expected: 'none' },
	// App returns to foreground: resume only if we paused it.
	{ event: 'visibilitychange', docHidden: false, isPlaying: false, wasPausedByBlur: true, expected: 'resume' },
	{ event: 'visibilitychange', docHidden: false, isPlaying: false, wasPausedByBlur: false, expected: 'none' },
	// User paused manually before backgrounding, then returns: stay paused.
	{ event: 'visibilitychange', docHidden: false, isPlaying: true, wasPausedByBlur: false, expected: 'none' },
	// Window blur while still visible (another app window focused): pause if playing.
	{ event: 'window-blur', docHidden: false, isPlaying: true, wasPausedByBlur: false, expected: 'pause' },
	{ event: 'window-blur', docHidden: false, isPlaying: false, wasPausedByBlur: false, expected: 'none' },
	// Blur fired while the document is already hidden: visibilitychange owns it.
	{ event: 'window-blur', docHidden: true, isPlaying: true, wasPausedByBlur: false, expected: 'none' },
	{ event: 'window-blur', docHidden: true, isPlaying: false, wasPausedByBlur: true, expected: 'none' }
];

describe('resolveVisibilityAction', () => {
	for (const row of table) {
		it(`${row.event} docHidden=${row.docHidden} isPlaying=${row.isPlaying} pausedByBlur=${row.wasPausedByBlur} → ${row.expected}`, () => {
			expect(
				resolveVisibilityAction(row.event, {
					docHidden: row.docHidden,
					isPlaying: row.isPlaying,
					wasPausedByBlur: row.wasPausedByBlur
				})
			).toBe(row.expected);
		});
	}
});
