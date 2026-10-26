import type { BookmarkContextLine } from '../../../bookmarks/bookmarkContextLines';
import { MOBILE_ROUTE_LABELS } from '../mobileNavigation';
import { mountMobileSwipeBack } from '../mobileSwipeBack';

export interface BookmarksPaneContext {
	title: string;
	subtitle: string;
	isPlaying: boolean;
}

export interface BookmarksPaneOptions {
	isMobile?: boolean;
}

export interface BookmarksPaneHandle {
	destroy(): void;
	setContextLines(lines: BookmarkContextLine[], currentLineIndex: number, resetSelection?: boolean): void;
	setBookmarkedLineIndices(indices: Set<number>): void;
	updateContext(ctx: BookmarksPaneContext): void;
	getSelectedLineIndices(): number[];
	clearSelection(): void;
	onSeekLine(cb: (lineIndex: number) => void): void;
	onCreateFromSelection(cb: (lineIndices: number[]) => void): void;
	onRemoveBookmark(cb: (lineIndex: number) => void): void;
	onOpenInObsidian(cb: () => void): void;
	onPlayPause(cb: () => void): void;
	onSwipeBack(cb: () => void): void;
}

const DOUBLE_ACTIVATION_MS = 300;
const SINGLE_ACTIVATION_MS = 280;
/** Horizontal travel before a press becomes a swipe instead of a tap or scroll. */
const SWIPE_SLOP_PX = 10;
/** Leftward drag that commits the select / remove action on release. */
const SWIPE_COMMIT_PX = 72;
const SWIPE_MAX_TRAVEL_PX = 120;

function saveButtonLabel(count: number): string {
	if (count === 1) {
		return 'Save bookmark';
	}
	return `Save ${count} bookmarks`;
}

function selectionCountLabel(count: number): string {
	return count === 1 ? '1 selected' : `${count} selected`;
}

/**
 * Swipe a line card left to toggle it: the card follows the finger, the action
 * underneath arms past SWIPE_COMMIT_PX, and releasing there fires `onCommit`.
 * Vertical motion is left to the scroller. Returns whether the last press was a
 * swipe, so the click that follows it can be ignored.
 */
function bindLineSwipe(textCard: HTMLElement, row: HTMLElement, onCommit: () => void): () => boolean {
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let dx = 0;
	let mode: 'pending' | 'swipe' | 'scroll' = 'pending';
	let swallowClick = false;

	const settle = () => {
		textCard.style.removeProperty('--sr-swipe-x');
		row.removeClass('is-swiping');
		row.removeClass('is-armed');
		pointerId = null;
	};

	textCard.addEventListener('pointerdown', (event) => {
		if (event.pointerType === 'mouse' && event.button !== 0) {
			return;
		}
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		dx = 0;
		mode = 'pending';
		swallowClick = false;
	});

	textCard.addEventListener('pointermove', (event) => {
		if (event.pointerId !== pointerId || mode === 'scroll') {
			return;
		}
		dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (mode === 'pending') {
			if (Math.abs(dy) > SWIPE_SLOP_PX && Math.abs(dy) >= Math.abs(dx)) {
				mode = 'scroll';
				return;
			}
			if (dx > -SWIPE_SLOP_PX || Math.abs(dx) <= Math.abs(dy)) {
				return;
			}
			mode = 'swipe';
			row.addClass('is-swiping');
			textCard.setPointerCapture?.(event.pointerId);
		}
		const travel = Math.max(-SWIPE_MAX_TRAVEL_PX, Math.min(0, dx));
		textCard.style.setProperty('--sr-swipe-x', `${travel}px`);
		row.toggleClass('is-armed', travel <= -SWIPE_COMMIT_PX);
	});

	textCard.addEventListener('pointerup', (event) => {
		if (event.pointerId !== pointerId) {
			return;
		}
		if (mode === 'swipe') {
			swallowClick = true;
			if (dx <= -SWIPE_COMMIT_PX) {
				onCommit();
			}
		}
		settle();
	});

	textCard.addEventListener('pointercancel', (event) => {
		if (event.pointerId === pointerId) {
			settle();
		}
	});

	return () => {
		const swallow = swallowClick;
		swallowClick = false;
		return swallow;
	};
}

function bindTextCardActivation(
	textCard: HTMLElement,
	isMobile: boolean,
	onSeek: () => void,
	onBookmarkToggle: () => void,
	wasSwipe: () => boolean
): void {
	let lastTapAt = 0;
	let pendingSeekTimer: number | null = null;

	function clearPendingSeek() {
		if (pendingSeekTimer !== null) {
			window.clearTimeout(pendingSeekTimer);
			pendingSeekTimer = null;
		}
	}

	function activateBookmarkToggle() {
		clearPendingSeek();
		lastTapAt = 0;
		onBookmarkToggle();
	}

	function scheduleSeek() {
		clearPendingSeek();
		pendingSeekTimer = window.setTimeout(() => {
			pendingSeekTimer = null;
			lastTapAt = 0;
			onSeek();
		}, SINGLE_ACTIVATION_MS);
	}

	textCard.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			onSeek();
		} else if (event.key === ' ') {
			event.preventDefault();
			onBookmarkToggle();
		}
	});

	if (isMobile) {
		textCard.addEventListener('click', (event) => {
			event.preventDefault();
			if (wasSwipe()) {
				return;
			}
			const now = Date.now();
			if (lastTapAt > 0 && now - lastTapAt <= DOUBLE_ACTIVATION_MS) {
				activateBookmarkToggle();
				return;
			}
			lastTapAt = now;
			scheduleSeek();
		});
		return;
	}

	textCard.addEventListener('click', () => {
		if (wasSwipe()) {
			return;
		}
		scheduleSeek();
	});
	textCard.addEventListener('dblclick', (event) => {
		event.preventDefault();
		activateBookmarkToggle();
	});
}

function isInteractiveBookmarksTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	return Boolean(
		target.closest(
			'button, input, label, .speed-reader-ai-bookmarks-floating-bar, .speed-reader-ai-bookmarks-open-link, .speed-reader-ai-bookmarks-header-play, .speed-reader-ai-mobile-stack-back'
		)
	);
}

export function mountBookmarksPane(
	container: HTMLElement,
	options: BookmarksPaneOptions = {}
): BookmarksPaneHandle {
	const isMobile = options.isMobile ?? false;
	const pane = container.createDiv({
		cls: 'speed-reader-ai-pane speed-reader-ai-pane-bookmarks is-hidden'
	});

	let backBtn: HTMLButtonElement | null = null;
	let titleEl: HTMLElement | null = null;
	let subtitleEl: HTMLElement | null = null;
	let playBtn: HTMLButtonElement | null = null;
	let openObsidianLink: HTMLButtonElement;

	if (isMobile) {
		const mobileHeader = pane.createDiv({
			cls: 'speed-reader-ai-mobile-stack-header speed-reader-ai-bookmarks-mobile-header'
		});
		backBtn = mobileHeader.createEl('button', {
			cls: 'speed-reader-ai-mobile-stack-back',
			text: '‹',
			attr: { type: 'button', 'aria-label': 'Back to reading' }
		});
		mobileHeader.createDiv({
			cls: 'speed-reader-ai-mobile-stack-title',
			text: MOBILE_ROUTE_LABELS.bookmarks
		});
		const mobileActions = pane.createDiv({ cls: 'speed-reader-ai-bookmarks-mobile-actions' });
		openObsidianLink = mobileActions.createEl('button', {
			cls: 'speed-reader-ai-bookmarks-open-link',
			text: 'Open in Obsidian',
			attr: { type: 'button' }
		});
	} else {
		const headerCard = pane.createDiv({ cls: 'speed-reader-ai-bookmarks-header-card' });
		const headerTop = headerCard.createDiv({ cls: 'speed-reader-ai-bookmarks-header-top' });
		const headerText = headerTop.createDiv({ cls: 'speed-reader-ai-bookmarks-header-text' });
		titleEl = headerText.createDiv({
			cls: 'speed-reader-ai-bookmarks-header-title',
			text: 'Reading'
		});
		subtitleEl = headerText.createDiv({
			cls: 'speed-reader-ai-bookmarks-header-subtitle',
			text: ''
		});
		playBtn = headerTop.createEl('button', {
			cls: 'speed-reader-ai-bookmarks-header-play',
			text: '▶ Play',
			attr: { type: 'button' }
		});
		openObsidianLink = headerCard.createEl('button', {
			cls: 'speed-reader-ai-bookmarks-open-link',
			text: 'Open in Obsidian',
			attr: { type: 'button' }
		});
	}

	const scroll = pane.createDiv({ cls: 'speed-reader-ai-bookmarks-scroll' });
	const scrollInner = scroll.createDiv({ cls: 'speed-reader-ai-bookmarks-scroll-inner' });
	const emptyEl = scrollInner.createDiv({
		cls: 'speed-reader-ai-bookmarks-empty',
		text: 'No readable lines in this section.'
	});
	const hintEl = scrollInner.createDiv({
		cls: 'speed-reader-ai-bookmarks-hint is-hidden',
		text: isMobile
			? 'Tap a line to jump there · swipe left or double-tap to select'
			: 'Click a line to jump there · swipe left, double-click or press Space to select'
	});
	const listEl = scrollInner.createDiv({ cls: 'speed-reader-ai-bookmarks-list is-hidden' });

	const floatingBar = pane.createDiv({ cls: 'speed-reader-ai-bookmarks-floating-bar is-hidden' });
	const floatingMeta = floatingBar.createDiv({ cls: 'speed-reader-ai-bookmarks-floating-meta' });
	const selectionCountEl = floatingMeta.createDiv({
		cls: 'speed-reader-ai-bookmarks-selection-count',
		text: '0 selected'
	});
	const floatingActions = floatingBar.createDiv({ cls: 'speed-reader-ai-bookmarks-floating-actions' });
	const clearBtn = floatingActions.createEl('button', {
		cls: 'speed-reader-ai-bookmarks-clear-btn',
		text: 'Clear',
		attr: { type: 'button' }
	});
	const saveBtn = floatingActions.createEl('button', {
		cls: 'speed-reader-ai-bookmarks-save-btn',
		text: 'Save bookmarks',
		attr: { type: 'button' }
	});

	let lines: BookmarkContextLine[] = [];
	let currentLineIndex = 0;
	const selected = new Set<number>();
	const bookmarked = new Set<number>();
	let seekLineHandler: ((lineIndex: number) => void) | null = null;
	let createFromSelectionHandler: ((lineIndices: number[]) => void) | null = null;
	let removeBookmarkHandler: ((lineIndex: number) => void) | null = null;
	let openObsidianHandler: (() => void) | null = null;
	let playPauseHandler: (() => void) | null = null;
	let swipeBackHandler: (() => void) | null = null;
	const cleanups: Array<() => void> = [];

	if (isMobile) {
		backBtn?.addEventListener('click', () => swipeBackHandler?.());
		cleanups.push(
			mountMobileSwipeBack(
				scroll,
				() => {
					swipeBackHandler?.();
				},
				{ shouldIgnoreTarget: isInteractiveBookmarksTarget }
			)
		);
	}

	function syncFloatingBar() {
		const count = selected.size;
		floatingBar.toggleClass('is-hidden', count === 0);
		selectionCountEl.setText(selectionCountLabel(count));
		saveBtn.setText(saveButtonLabel(count));
		saveBtn.disabled = count === 0;
	}

	function syncEmptyState() {
		const hasLines = lines.length > 0;
		emptyEl.toggleClass('is-hidden', hasLines);
		hintEl.toggleClass('is-hidden', !hasLines);
		listEl.toggleClass('is-hidden', !hasLines);
		syncFloatingBar();
	}

	function setLineSelected(lineIndex: number, next: boolean) {
		if (next) {
			selected.add(lineIndex);
		} else {
			selected.delete(lineIndex);
		}
		syncFloatingBar();
	}

	function toggleLineSelected(lineIndex: number) {
		setLineSelected(lineIndex, !selected.has(lineIndex));
	}

	function swipeActionLabel(lineIndex: number): string {
		if (bookmarked.has(lineIndex)) {
			return 'Remove';
		}
		return selected.has(lineIndex) ? 'Deselect' : 'Select';
	}

	function syncRowSelectionState(row: HTMLElement, lineIndex: number) {
		const isSelected = selected.has(lineIndex);
		row.toggleClass('is-selected', isSelected);
		row.querySelector('.speed-reader-ai-bookmark-line-text-card')?.setAttr('aria-pressed', String(isSelected));
		row.querySelector('.speed-reader-ai-bookmark-line-swipe-action')?.setText(swipeActionLabel(lineIndex));
	}

	function handleBookmarkToggle(lineIndex: number, row: HTMLElement) {
		if (bookmarked.has(lineIndex)) {
			removeBookmarkHandler?.(lineIndex);
			return;
		}
		toggleLineSelected(lineIndex);
		syncRowSelectionState(row, lineIndex);
	}

	function scrollCurrentLineIntoView() {
		const currentRow = listEl.querySelector('.speed-reader-ai-bookmark-line-row.is-current');
		if (currentRow instanceof HTMLElement) {
			currentRow.scrollIntoView({ block: 'center', behavior: 'auto' });
		}
	}

	function renderBadges(badgesEl: HTMLElement, lineIndex: number) {
		badgesEl.empty();
		const parts: string[] = [];
		if (bookmarked.has(lineIndex)) {
			parts.push('Bookmarked');
		}
		if (lineIndex === currentLineIndex) {
			parts.push('Current segment');
		}
		if (parts.length === 0) {
			badgesEl.addClass('is-hidden');
			return;
		}
		badgesEl.removeClass('is-hidden');
		badgesEl.setText(parts.join(' · '));
	}

	function renderLines(resetSelection = false) {
		if (resetSelection) {
			selected.clear();
		}

		listEl.empty();

		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index]!;
			const previousLine = index > 0 ? lines[index - 1] : null;
			const row = listEl.createEl('article', {
				cls: 'speed-reader-ai-bookmark-line-row',
				attr: { 'data-line-index': String(line.lineIndex) }
			});

			if (line.lineIndex < currentLineIndex) {
				row.addClass('is-past');
			} else if (line.lineIndex > currentLineIndex) {
				row.addClass('is-future');
			} else {
				row.addClass('is-current');
			}

			if (bookmarked.has(line.lineIndex)) {
				row.addClass('is-bookmarked');
			}

			if (previousLine && previousLine.paragraphIndex !== line.paragraphIndex) {
				row.addClass('is-paragraph-start');
			}

			if (selected.has(line.lineIndex)) {
				row.addClass('is-selected');
			}

			const swipeAction = row.createDiv({
				cls: 'speed-reader-ai-bookmark-line-swipe-action',
				attr: { 'aria-hidden': 'true' }
			});
			const textCard = row.createDiv({
				cls: 'speed-reader-ai-bookmark-line-text-card',
				attr: { tabindex: '0', role: 'button', 'aria-pressed': String(selected.has(line.lineIndex)) }
			});
			textCard.createEl('p', {
				cls: 'speed-reader-ai-bookmark-line-text',
				text: line.text || '(empty line)'
			});
			const badgesEl = textCard.createDiv({ cls: 'speed-reader-ai-bookmark-line-badges' });
			renderBadges(badgesEl, line.lineIndex);
			swipeAction.setText(swipeActionLabel(line.lineIndex));

			const toggle = () => handleBookmarkToggle(line.lineIndex, row);
			bindTextCardActivation(
				textCard,
				isMobile,
				() => seekLineHandler?.(line.lineIndex),
				toggle,
				bindLineSwipe(textCard, row, toggle)
			);
		}

		syncEmptyState();
		requestAnimationFrame(() => scrollCurrentLineIntoView());
	}

	saveBtn.addEventListener('click', () => {
		if (selected.size === 0) {
			return;
		}
		createFromSelectionHandler?.([...selected].sort((left, right) => left - right));
	});

	clearBtn.addEventListener('click', () => {
		selected.clear();
		renderLines(false);
	});

	openObsidianLink.addEventListener('click', () => {
		openObsidianHandler?.();
	});

	playBtn?.addEventListener('click', () => {
		playPauseHandler?.();
	});

	return {
		destroy() {
			for (const cleanup of cleanups) {
				cleanup();
			}
			pane.remove();
		},
		setContextLines(nextLines, nextCurrentLineIndex, resetSelection = false) {
			lines = nextLines;
			currentLineIndex = nextCurrentLineIndex;
			renderLines(resetSelection);
		},
		setBookmarkedLineIndices(indices) {
			bookmarked.clear();
			for (const index of indices) {
				bookmarked.add(index);
			}
			if (lines.length > 0) {
				renderLines(false);
			}
		},
		updateContext(ctx) {
			titleEl?.setText(ctx.title || 'Reading');
			subtitleEl?.setText(ctx.subtitle);
			playBtn?.setText(ctx.isPlaying ? '⏸ Pause' : '▶ Play');
		},
		getSelectedLineIndices() {
			return [...selected].sort((left, right) => left - right);
		},
		clearSelection() {
			selected.clear();
			renderLines(false);
		},
		onSeekLine(cb) {
			seekLineHandler = cb;
		},
		onCreateFromSelection(cb) {
			createFromSelectionHandler = cb;
		},
		onRemoveBookmark(cb) {
			removeBookmarkHandler = cb;
		},
		onOpenInObsidian(cb) {
			openObsidianHandler = cb;
		},
		onPlayPause(cb) {
			playPauseHandler = cb;
		},
		onSwipeBack(cb) {
			swipeBackHandler = cb;
		}
	};
}
