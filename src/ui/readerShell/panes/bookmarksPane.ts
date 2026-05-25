import type { BookmarkEntry } from '../../../bookmarks/parseBookmarkEntries';

export interface BookmarkLineSelection {
	entryIndex: number;
	lineIndex: number;
}

export interface BookmarksPaneHandle {
	destroy(): void;
	setEntries(entries: BookmarkEntry[]): void;
	getSelected(): BookmarkLineSelection[];
	clearSelection(): void;
	onSeek(cb: (entryIndex: number) => void): void;
	onBatchBookmark(cb: (selections: BookmarkLineSelection[]) => void): void;
	onOpenInObsidian(cb: () => void): void;
}

function appendHighlightedLineText(container: HTMLElement, text: string): void {
	const parts = text.split(/(==\*\*\*.+?\*\*\*==)/g);
	for (const part of parts) {
		const highlightMatch = part.match(/^==\*\*\*(.+?)\*\*\*==$/);
		if (highlightMatch) {
			container.createSpan({
				cls: 'speed-reader-ai-bookmark-line-highlight',
				text: highlightMatch[1] ?? ''
			});
			continue;
		}
		if (part) {
			container.createSpan({ text: part });
		}
	}
}

export function mountBookmarksPane(container: HTMLElement): BookmarksPaneHandle {
	const pane = container.createDiv({
		cls: 'speed-reader-ai-pane speed-reader-ai-pane-bookmarks is-hidden'
	});

	const toolbar = pane.createDiv({ cls: 'speed-reader-ai-bookmarks-toolbar' });
	const batchBtn = toolbar.createEl('button', {
		cls: 'speed-reader-ai-bookmarks-action-btn',
		text: 'Bookmark selected',
		attr: { type: 'button' }
	});
	const openObsidianBtn = toolbar.createEl('button', {
		cls: 'speed-reader-ai-bookmarks-action-btn speed-reader-ai-bookmarks-action-secondary',
		text: 'Open in Obsidian',
		attr: { type: 'button' }
	});

	const scroll = pane.createDiv({ cls: 'speed-reader-ai-bookmarks-scroll' });
	const emptyEl = scroll.createDiv({
		cls: 'speed-reader-ai-bookmarks-empty',
		text: 'No saved bookmarks yet.'
	});
	const listEl = scroll.createDiv({ cls: 'speed-reader-ai-bookmarks-list is-hidden' });

	let entries: BookmarkEntry[] = [];
	const selected = new Set<string>();
	let seekHandler: ((entryIndex: number) => void) | null = null;
	let batchHandler: ((selections: BookmarkLineSelection[]) => void) | null = null;
	let openObsidianHandler: (() => void) | null = null;

	function selectionKey(entryIndex: number, lineIndex: number): string {
		return `${entryIndex}:${lineIndex}`;
	}

	function syncEmptyState() {
		const hasEntries = entries.length > 0;
		emptyEl.toggleClass('is-hidden', hasEntries);
		listEl.toggleClass('is-hidden', !hasEntries);
		batchBtn.disabled = selected.size === 0;
	}

	function renderEntries() {
		listEl.empty();
		selected.clear();

		for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
			const entry = entries[entryIndex]!;
			const entryCard = listEl.createDiv({ cls: 'speed-reader-ai-bookmark-entry-card' });

			const headingParts = [entry.timestamp];
			if (entry.sectionTitle) {
				headingParts.push(entry.sectionTitle);
			}
			entryCard.createDiv({
				cls: 'speed-reader-ai-bookmark-entry-heading',
				text: headingParts.join(' · ')
			});

			const lineCardsHost = entryCard.createDiv({ cls: 'speed-reader-ai-bookmark-line-cards' });
			const lineCards =
				entry.lineCards.length > 0 ? entry.lineCards : [{ text: entry.passage || '(empty passage)' }];

			for (let lineIndex = 0; lineIndex < lineCards.length; lineIndex += 1) {
				const lineCard = lineCards[lineIndex]!;
				const row = lineCardsHost.createDiv({ cls: 'speed-reader-ai-bookmark-line-card' });

				const checkbox = row.createEl('input', {
					type: 'checkbox',
					cls: 'speed-reader-ai-bookmark-line-checkbox'
				});
				checkbox.addEventListener('change', () => {
					const key = selectionKey(entryIndex, lineIndex);
					if (checkbox.checked) {
						selected.add(key);
						row.addClass('is-selected');
					} else {
						selected.delete(key);
						row.removeClass('is-selected');
					}
					syncEmptyState();
				});

				const textBtn = row.createEl('button', {
					cls: 'speed-reader-ai-bookmark-line-text-btn',
					attr: { type: 'button' }
				});
				appendHighlightedLineText(textBtn, lineCard.text);
				textBtn.addEventListener('click', () => {
					seekHandler?.(entryIndex);
				});
			}

			if (entry.positionLine) {
				entryCard.createDiv({
					cls: 'speed-reader-ai-bookmark-entry-meta',
					text: entry.positionLine
				});
			}
		}

		syncEmptyState();
	}

	batchBtn.addEventListener('click', () => {
		if (selected.size === 0) {
			return;
		}
		const selections: BookmarkLineSelection[] = [...selected].map((key) => {
			const [entryIndex, lineIndex] = key.split(':');
			return {
				entryIndex: Number.parseInt(entryIndex ?? '0', 10),
				lineIndex: Number.parseInt(lineIndex ?? '0', 10)
			};
		});
		batchHandler?.(selections);
	});

	openObsidianBtn.addEventListener('click', () => {
		openObsidianHandler?.();
	});

	return {
		destroy() {
			pane.remove();
		},
		setEntries(nextEntries) {
			entries = nextEntries;
			renderEntries();
		},
		getSelected() {
			return [...selected].map((key) => {
				const [entryIndex, lineIndex] = key.split(':');
				return {
					entryIndex: Number.parseInt(entryIndex ?? '0', 10),
					lineIndex: Number.parseInt(lineIndex ?? '0', 10)
				};
			});
		},
		clearSelection() {
			selected.clear();
			for (const checkbox of listEl.querySelectorAll<HTMLInputElement>(
				'.speed-reader-ai-bookmark-line-checkbox'
			)) {
				checkbox.checked = false;
			}
			for (const row of listEl.querySelectorAll('.speed-reader-ai-bookmark-line-card')) {
				row.removeClass('is-selected');
			}
			syncEmptyState();
		},
		onSeek(cb) {
			seekHandler = cb;
		},
		onBatchBookmark(cb) {
			batchHandler = cb;
		},
		onOpenInObsidian(cb) {
			openObsidianHandler = cb;
		}
	};
}
