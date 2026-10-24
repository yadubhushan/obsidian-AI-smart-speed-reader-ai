import { setIcon } from 'obsidian';
import { renderBookCoverArt, type BookCoverArtDeps } from './bookCoverArt';
import { splitBookTitle } from './bookTitleCleanup';
import type { BookHistoryRow, DashboardSection } from './historyListModel';

/** Where to open the actions menu: a mouse event, or a point from a touch long-press. */
export type BookMenuAnchor = MouseEvent | { x: number; y: number };

export interface BookGridDeps extends BookCoverArtDeps {
	onOpen: (row: BookHistoryRow) => void;
	/** Opens the per-book actions menu at the pointer (or under the ⋯ button). */
	onMenu: (row: BookHistoryRow, anchor: BookMenuAnchor) => void;
}

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

interface LongPressHandle {
	/** True right after a long-press opened the menu: swallow the follow-up click/contextmenu. */
	justFired(): boolean;
	/** Drop a pending long-press (e.g. Android's own `contextmenu` got there first). */
	cancel(): void;
}

/** Touch long-press opens the menu. iOS never fires `contextmenu`; Android does. */
function attachLongPress(
	tile: HTMLElement,
	onLongPress: (point: { x: number; y: number }) => void
): LongPressHandle {
	let timer: number | null = null;
	let start: { x: number; y: number } | null = null;
	let firedAt = 0;

	const cancel = () => {
		if (timer !== null) {
			window.clearTimeout(timer);
			timer = null;
		}
		start = null;
	};

	tile.addEventListener(
		'touchstart',
		(event) => {
			const touch = event.touches[0];
			if (!touch || event.touches.length > 1) {
				cancel();
				return;
			}
			start = { x: touch.clientX, y: touch.clientY };
			timer = window.setTimeout(() => {
				timer = null;
				if (start) {
					firedAt = Date.now();
					onLongPress(start);
				}
			}, LONG_PRESS_MS);
		},
		{ passive: true }
	);
	tile.addEventListener(
		'touchmove',
		(event) => {
			const touch = event.touches[0];
			if (!start || !touch) {
				return;
			}
			const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y);
			if (moved > LONG_PRESS_MOVE_TOLERANCE_PX) {
				cancel();
			}
		},
		{ passive: true }
	);
	tile.addEventListener('touchend', cancel, { passive: true });
	tile.addEventListener('touchcancel', cancel, { passive: true });

	return { justFired: () => Date.now() - firedAt < 800, cancel };
}

function tileStatusLabel(row: BookHistoryRow): string {
	if (row.status === 'finished') {
		return 'Finished';
	}
	const percent = Math.round(row.progressPercent);
	if (row.status === 'in_progress' && percent > 0) {
		return `${percent}%`;
	}
	return row.section === 'unread' ? 'New' : 'Started';
}

function renderTileCover(tile: HTMLElement, row: BookHistoryRow, deps: BookGridDeps): void {
	const cover = tile.createDiv({ cls: 'srai-lib-tile__cover' });
	renderBookCoverArt(cover, row, deps);

	const badges = cover.createDiv({ cls: 'srai-lib-tile__badges' });
	if (row.isContinueTarget) {
		badges.createSpan({ cls: 'srai-lib-tile__badge is-current', text: 'Current' });
	}
	if (row.pinned) {
		const pin = badges.createSpan({
			cls: 'srai-lib-tile__badge is-pin',
			attr: { 'aria-label': 'Pinned' }
		});
		setIcon(pin, 'pin');
	}
	if (!row.inVault) {
		badges.createSpan({
			cls: 'srai-lib-tile__badge is-missing',
			text: 'No file',
			attr: { title: 'The EPUB is gone from the vault; cached text and progress remain.' }
		});
	}

	const menuBtn = cover.createEl('button', {
		cls: 'srai-lib-tile__menu clickable-icon',
		attr: { type: 'button', 'aria-label': `Actions for ${row.title}` }
	});
	setIcon(menuBtn, 'more-horizontal');
	menuBtn.addEventListener('click', (event) => {
		event.stopPropagation();
		deps.onMenu(row, event);
	});

	if (row.status !== 'unread' && row.progressPercent > 0) {
		const bar = cover.createDiv({ cls: 'srai-lib-tile__progress' });
		bar.createDiv({ cls: 'srai-lib-tile__progress-fill' }).style.width =
			`${Math.max(2, Math.min(100, row.progressPercent))}%`;
	}
}

export function renderBookTile(
	parent: HTMLElement,
	row: BookHistoryRow,
	deps: BookGridDeps
): HTMLElement {
	const { main, subtitle } = splitBookTitle(row.title);
	const tooltip = [row.title, row.author].filter(Boolean).join('\n');
	const tile = parent.createDiv({
		cls: `srai-lib-tile${row.status === 'finished' ? ' is-finished' : ''}`,
		attr: { tabindex: '0', role: 'button', 'aria-label': `Open ${row.title}`, title: tooltip }
	});
	const longPress = attachLongPress(tile, (point) => deps.onMenu(row, point));
	tile.addEventListener('click', (event) => {
		if (longPress.justFired()) {
			event.preventDefault();
			return;
		}
		deps.onOpen(row);
	});
	tile.addEventListener('contextmenu', (event) => {
		event.preventDefault();
		if (longPress.justFired()) {
			return;
		}
		longPress.cancel();
		deps.onMenu(row, event);
	});
	tile.addEventListener('keydown', (event) => {
		if (event.target !== tile) {
			return;
		}
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			deps.onOpen(row);
		}
	});

	renderTileCover(tile, row, deps);

	const text = tile.createDiv({ cls: 'srai-lib-tile__text' });
	text.createDiv({ cls: 'srai-lib-tile__title', text: main });
	if (subtitle) {
		text.createDiv({ cls: 'srai-lib-tile__subtitle', text: subtitle });
	}
	const meta = text.createDiv({ cls: 'srai-lib-tile__meta' });
	if (row.author) {
		meta.createSpan({ cls: 'srai-lib-tile__author', text: row.author });
	}
	meta.createSpan({ cls: 'srai-lib-tile__status', text: tileStatusLabel(row) });
	return tile;
}

export function renderBookShelf(
	parent: HTMLElement,
	section: DashboardSection<BookHistoryRow>,
	deps: BookGridDeps
): void {
	const shelf = parent.createDiv({ cls: 'srai-lib-shelf' });
	const header = shelf.createDiv({ cls: 'srai-lib-shelf__header' });
	header.createDiv({ cls: 'srai-lib-shelf__title', text: section.title });
	header.createDiv({ cls: 'srai-lib-shelf__count', text: String(section.rows.length) });

	const grid = shelf.createDiv({ cls: 'srai-lib-grid' });
	for (const row of section.rows) {
		renderBookTile(grid, row, deps);
	}
}
