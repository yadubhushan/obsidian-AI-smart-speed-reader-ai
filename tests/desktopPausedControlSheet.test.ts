// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types';
import { mountDesktopPausedControlSheet } from '../src/ui/readerShell/desktopPausedControlSheet';
import { installObsidianDomExtensions } from './domExtensions';

beforeAll(() => installObsidianDomExtensions());

function buttonWithText(root: HTMLElement, text: string): HTMLButtonElement {
	const button = [...root.querySelectorAll('button')].find((candidate) =>
		candidate.textContent?.includes(text)
	);
	if (!(button instanceof HTMLButtonElement)) {
		throw new Error(`Button not found: ${text}`);
	}
	return button;
}

describe('desktop paused control sheet', () => {
	it('routes primary and secondary controls without changing reader state itself', () => {
		const handlers = {
			onPlayPause: vi.fn(),
			onWpmDelta: vi.fn(),
			onFontDelta: vi.fn(),
			onPlaybackModeChange: vi.fn(),
			onPreviousSection: vi.fn(),
			onNextSection: vi.fn(),
			onNavigate: vi.fn(),
			onTtsToggle: vi.fn(),
			onBookmark: vi.fn(),
			onCopyContext: vi.fn(),
			onOpenSetup: vi.fn(),
			onOpenContent: vi.fn(),
			onOpenBookmarks: vi.fn(),
			onOpenShortcuts: vi.fn(),
			onOpenSettings: vi.fn()
		};
		const host = document.createElement('div');
		const handle = mountDesktopPausedControlSheet(host, handlers);
		handle.update({
			readerState: null,
			settings: structuredClone(DEFAULT_SETTINGS),
			navigationLabel: 'Section',
			navigationOptions: [
				{ id: 'one', label: '1 of 2 · One' },
				{ id: 'two', label: '2 of 2 · Two' }
			],
			currentNavigationId: 'one',
			canStepNavigation: true,
			prepareStatus: 'deterministic',
			showPrepareStatus: true
		});
		handle.setVisible(true);

		buttonWithText(host, 'Play').click();
		(host.querySelector('[aria-label="Increase reading speed"]') as HTMLButtonElement).click();
		buttonWithText(host, 'Speech').click();
		buttonWithText(host, 'Bookmark').click();
		buttonWithText(host, 'Appearance').click();
		(host.querySelector('[aria-label="Increase font size"]') as HTMLButtonElement).click();

		const navigation = host.querySelector(
			'.speed-reader-ai-paused-sheet-section-select'
		) as HTMLSelectElement;
		navigation.value = 'two';
		navigation.dispatchEvent(new Event('change'));

		const mode = host.querySelector('.speed-reader-ai-paused-sheet-mode-select') as HTMLSelectElement;
		mode.value = 'lineByLine';
		mode.dispatchEvent(new Event('change'));

		buttonWithText(host, 'More').click();
		for (const label of [
			'Copy context',
			'Reading setup',
			'Contents',
			'Bookmarks',
			'Shortcuts',
			'Preferences'
		]) {
			buttonWithText(host, label).click();
		}

		expect(handlers.onPlayPause).toHaveBeenCalledOnce();
		expect(handlers.onWpmDelta).toHaveBeenCalledWith(25);
		expect(handlers.onTtsToggle).toHaveBeenCalledOnce();
		expect(handlers.onBookmark).toHaveBeenCalledOnce();
		expect(handlers.onFontDelta).toHaveBeenCalledWith(3);
		expect(handlers.onNavigate).toHaveBeenCalledWith('two');
		expect(handlers.onPlaybackModeChange).toHaveBeenCalledWith('lineByLine');
		expect(handlers.onCopyContext).toHaveBeenCalledOnce();
		expect(handlers.onOpenSetup).toHaveBeenCalledOnce();
		expect(handlers.onOpenContent).toHaveBeenCalledOnce();
		expect(handlers.onOpenBookmarks).toHaveBeenCalledOnce();
		expect(handlers.onOpenShortcuts).toHaveBeenCalledOnce();
		expect(handlers.onOpenSettings).toHaveBeenCalledOnce();
		handle.destroy();
	});
});

