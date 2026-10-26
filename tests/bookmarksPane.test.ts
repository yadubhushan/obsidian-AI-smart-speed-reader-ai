// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { BookmarkContextLine } from '../src/bookmarks/bookmarkContextLines';
import { mountBookmarksPane } from '../src/ui/readerShell/panes/bookmarksPane';
import { installObsidianDomExtensions } from './domExtensions';

beforeAll(() => {
	installObsidianDomExtensions();
	vi.stubGlobal('requestAnimationFrame', () => 0);
	// jsdom has no layout; fake timers also run rAF, which scrolls the current line.
	HTMLElement.prototype.scrollIntoView = () => {};
});

const LINES: BookmarkContextLine[] = ['First line.', 'Second line.'].map((text, lineIndex) => ({
	lineIndex,
	text,
	paragraphIndex: 0,
	startSeekIndex: lineIndex * 10,
	startWordIdx: lineIndex * 10
}));

function pointer(target: HTMLElement, type: string, clientX: number, clientY = 0) {
	const event = new MouseEvent(type, { bubbles: true, clientX, clientY, button: 0 });
	Object.assign(event, { pointerId: 1, pointerType: 'touch' });
	target.dispatchEvent(event);
}

function swipe(card: HTMLElement, distance: number) {
	pointer(card, 'pointerdown', 200);
	pointer(card, 'pointermove', 200 - distance / 2);
	pointer(card, 'pointermove', 200 - distance);
	pointer(card, 'pointerup', 200 - distance);
	card.click();
}

function mount() {
	const host = document.createElement('div');
	const pane = mountBookmarksPane(host, { isMobile: true });
	pane.setContextLines(LINES, 0);
	const cards = [...host.querySelectorAll<HTMLElement>('.speed-reader-ai-bookmark-line-text-card')];
	return { host, pane, cards };
}

describe('bookmarks pane gestures', () => {
	it('renders full-width cards without checkbox or bookmark button', () => {
		const { host, cards } = mount();
		expect(cards).toHaveLength(2);
		expect(host.querySelector('input[type="checkbox"]')).toBeNull();
		expect(host.querySelector('button.speed-reader-ai-bookmark-line-bookmark-btn')).toBeNull();
	});

	it('selects a line on a long left swipe and deselects on the next', () => {
		const { pane, cards } = mount();
		swipe(cards[1]!, 100);
		expect(pane.getSelectedLineIndices()).toEqual([1]);
		swipe(cards[1]!, 100);
		expect(pane.getSelectedLineIndices()).toEqual([]);
	});

	it('ignores a short swipe and does not treat it as a tap', () => {
		vi.useFakeTimers();
		const { pane, cards } = mount();
		const onSeek = vi.fn();
		pane.onSeekLine(onSeek);
		swipe(cards[0]!, 40);
		vi.advanceTimersByTime(500);
		expect(pane.getSelectedLineIndices()).toEqual([]);
		expect(onSeek).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it('seeks on a single tap', () => {
		vi.useFakeTimers();
		const { pane, cards } = mount();
		const onSeek = vi.fn();
		pane.onSeekLine(onSeek);
		cards[1]!.click();
		vi.advanceTimersByTime(500);
		expect(onSeek).toHaveBeenCalledWith(1);
		vi.useRealTimers();
	});

	it('removes an existing bookmark on swipe instead of selecting', () => {
		const { host, pane } = mount();
		const onRemove = vi.fn();
		pane.onRemoveBookmark(onRemove);
		pane.setBookmarkedLineIndices(new Set([0]));
		swipe(host.querySelector<HTMLElement>('.speed-reader-ai-bookmark-line-text-card')!, 100);
		expect(onRemove).toHaveBeenCalledWith(0);
		expect(pane.getSelectedLineIndices()).toEqual([]);
	});
});
