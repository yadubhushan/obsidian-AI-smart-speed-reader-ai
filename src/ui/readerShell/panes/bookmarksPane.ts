import type { BookmarkContextLine } from '../../../bookmarks/bookmarkContextLines';

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
}

const DOUBLE_ACTIVATION_MS = 300;
const SINGLE_ACTIVATION_MS = 280;

function saveButtonLabel(count: number): string {
	if (count === 1) {
		return 'Save bookmark';
	}
	return `Save ${count} bookmarks`;
}

function selectionCountLabel(count: number): string {
	return count === 1 ? '1 selected' : `${count} selected`;
}

function bindTextCardActivation(
	textCard: HTMLElement,
	isMobile: boolean,
	onSeek: () => void,
	onBookmarkToggle: () => void
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

	if (isMobile) {
		textCard.addEventListener('click', (event) => {
			event.preventDefault();
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
		scheduleSeek();
	});
	textCard.addEventListener('dblclick', (event) => {
		event.preventDefault();
		activateBookmarkToggle();
	});
}

export function mountBookmarksPane(
	container: HTMLElement,
	options: BookmarksPaneOptions = {}
): BookmarksPaneHandle {
	const isMobile = options.isMobile ?? false;
	const pane = container.createDiv({
		cls: 'speed-reader-ai-pane speed-reader-ai-pane-bookmarks is-hidden'
	});

	const headerCard = pane.createDiv({ cls: 'speed-reader-ai-bookmarks-header-card' });
	const headerTop = headerCard.createDiv({ cls: 'speed-reader-ai-bookmarks-header-top' });
	const headerText = headerTop.createDiv({ cls: 'speed-reader-ai-bookmarks-header-text' });
	const titleEl = headerText.createDiv({
		cls: 'speed-reader-ai-bookmarks-header-title',
		text: 'Reading'
	});
	const subtitleEl = headerText.createDiv({
		cls: 'speed-reader-ai-bookmarks-header-subtitle',
		text: ''
	});
	const playBtn = headerTop.createEl('button', {
		cls: 'speed-reader-ai-bookmarks-header-play',
		text: '▶ Play',
		attr: { type: 'button' }
	});
	const openObsidianLink = headerCard.createEl('button', {
		cls: 'speed-reader-ai-bookmarks-open-link',
		text: 'Open in Obsidian',
		attr: { type: 'button' }
	});

	const scroll = pane.createDiv({ cls: 'speed-reader-ai-bookmarks-scroll' });
	const scrollInner = scroll.createDiv({ cls: 'speed-reader-ai-bookmarks-scroll-inner' });
	const emptyEl = scrollInner.createDiv({
		cls: 'speed-reader-ai-bookmarks-empty',
		text: 'No readable lines in this section.'
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

	function syncRowSelectionState(row: HTMLElement, checkbox: HTMLInputElement, lineIndex: number) {
		const isSelected = selected.has(lineIndex);
		checkbox.checked = isSelected;
		row.toggleClass('is-selected', isSelected);
		const bookmarkBtn = row.querySelector('.speed-reader-ai-bookmark-line-bookmark-btn');
		if (bookmarkBtn instanceof HTMLElement) {
			bookmarkBtn.toggleClass('is-active', isSelected);
		}
	}

	function handleBookmarkToggle(
		lineIndex: number,
		row: HTMLElement,
		checkbox: HTMLInputElement
	) {
		if (bookmarked.has(lineIndex)) {
			removeBookmarkHandler?.(lineIndex);
			return;
		}
		toggleLineSelected(lineIndex);
		syncRowSelectionState(row, checkbox, lineIndex);
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

			const selectLabel = row.createEl('label', {
				cls: 'speed-reader-ai-bookmark-line-select',
				attr: { 'aria-label': 'Select line' }
			});
			const checkbox = selectLabel.createEl('input', {
				type: 'checkbox',
				cls: 'speed-reader-ai-bookmark-line-checkbox'
			});
			checkbox.checked = selected.has(line.lineIndex);
			selectLabel.createSpan({
				cls: 'speed-reader-ai-bookmark-line-checkmark',
				attr: { 'aria-hidden': 'true' }
			});

			checkbox.addEventListener('click', (event) => {
				event.stopPropagation();
			});
			checkbox.addEventListener('change', () => {
				setLineSelected(line.lineIndex, checkbox.checked);
				syncRowSelectionState(row, checkbox, line.lineIndex);
			});
			selectLabel.addEventListener('click', (event) => {
				event.stopPropagation();
			});

			const textCard = row.createDiv({ cls: 'speed-reader-ai-bookmark-line-text-card' });
			textCard.createEl('p', {
				cls: 'speed-reader-ai-bookmark-line-text',
				text: line.text || '(empty line)'
			});
			const badgesEl = textCard.createDiv({ cls: 'speed-reader-ai-bookmark-line-badges' });
			renderBadges(badgesEl, line.lineIndex);

			bindTextCardActivation(
				textCard,
				isMobile,
				() => seekLineHandler?.(line.lineIndex),
				() => handleBookmarkToggle(line.lineIndex, row, checkbox)
			);

			const isAlreadyBookmarked = bookmarked.has(line.lineIndex);
			const bookmarkBtn = row.createEl('button', {
				cls: `speed-reader-ai-bookmark-line-bookmark-btn${selected.has(line.lineIndex) ? ' is-active' : ''}`,
				text: '🔖',
				attr: {
					type: 'button',
					'aria-label': isAlreadyBookmarked
						? 'Remove bookmark'
						: selected.has(line.lineIndex)
							? 'Remove from selection'
							: 'Bookmark line'
				}
			});
			bookmarkBtn.addEventListener('click', (event) => {
				event.stopPropagation();
				handleBookmarkToggle(line.lineIndex, row, checkbox);
			});
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

	playBtn.addEventListener('click', () => {
		playPauseHandler?.();
	});

	return {
		destroy() {
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
			titleEl.setText(ctx.title || 'Reading');
			subtitleEl.setText(ctx.subtitle);
			playBtn.setText(ctx.isPlaying ? '⏸ Pause' : '▶ Play');
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
		}
	};
}
