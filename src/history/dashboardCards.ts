import { setIcon, type App } from 'obsidian';
import { bookCacheCoverPath } from '../store/bookCachePaths';
import type { PluginServices } from '../services/serviceRegistry';
import { renderProgressRing } from './progressRing';
import type { BookHistoryRow, DashboardSection, NoteHistoryRow } from './historyListModel';

export type DashboardRow = BookHistoryRow | NoteHistoryRow;

export interface DashboardCardDeps {
	app: App;
	services: PluginServices;
	coverUrls: string[];
	isDisposed: () => boolean;
	onOpen: (row: DashboardRow) => void;
	onTogglePin?: (row: DashboardRow) => void;
	onDelete?: (row: DashboardRow) => void;
}

function createSurface(parent: HTMLElement, row: DashboardRow): HTMLElement {
	const surface = parent.createDiv({
		cls: `speed-reader-dashboard-card__surface speed-reader-dashboard-card__surface--${row.surfaceKind}`
	});
	if (row.surfaceKind === 'note') {
		surface.createSpan({
			cls: 'speed-reader-dashboard-card__surface-glyph',
			text: row.typeLabel.slice(0, 1)
		});
	}
	return surface;
}

async function loadBookCover(
	app: App,
	services: PluginServices,
	coverUrls: string[],
	docKey: string,
	coverEl: HTMLElement,
	isDisposed: () => boolean
): Promise<void> {
	const coverPath = bookCacheCoverPath(services.dataPaths.bookCacheBase, docKey);
	try {
		const exists = await app.vault.adapter.exists(coverPath);
		if (!exists || isDisposed()) {
			coverEl.addClass('is-placeholder');
			return;
		}
		const bytes = await app.vault.adapter.readBinary(coverPath);
		const blob = new Blob([bytes], { type: 'image/jpeg' });
		const url = URL.createObjectURL(blob);
		coverUrls.push(url);
		if (isDisposed()) {
			URL.revokeObjectURL(url);
			return;
		}
		coverEl.style.backgroundImage = `url("${url}")`;
		coverEl.removeClass('is-placeholder');
		coverEl.empty();
	} catch {
		coverEl.addClass('is-placeholder');
	}
}

function renderCardMeta(parent: HTMLElement, row: DashboardRow): void {
	const meta = parent.createDiv({ cls: 'speed-reader-dashboard-card__meta' });
	const top = meta.createDiv({ cls: 'speed-reader-dashboard-card__topline' });
	top.createSpan({
		cls: 'speed-reader-dashboard-card__type-badge',
		text: row.typeLabel
	});
	if ('badgeLabel' in row) {
		top.createSpan({
			cls: `speed-reader-dashboard-card__mode-badge speed-reader-dashboard-card__mode-badge--${row.badge}`,
			text: row.badgeLabel
		});
	}
	if (row.isContinueTarget) {
		top.createSpan({
			cls: 'speed-reader-dashboard-card__continue-badge',
			text: 'Current'
		});
	}

	meta.createDiv({ cls: 'speed-reader-dashboard-card__title', text: row.title });
	if ('author' in row && row.author) {
		meta.createDiv({
			cls: 'speed-reader-dashboard-card__secondary',
			text: row.author
		});
	}
	if (row.folder) {
		meta.createDiv({
			cls: 'speed-reader-dashboard-card__folder',
			text: row.folder
		});
	}

	meta.createDiv({
		cls: 'speed-reader-dashboard-card__support',
		text: row.lengthLabel
	});
}

function renderPinButton(
	parent: HTMLElement,
	row: DashboardRow,
	onTogglePin: ((row: DashboardRow) => void) | undefined
): void {
	const pinBtn = parent.createEl('button', {
		cls: `speed-reader-dashboard-card__pin${row.pinned ? ' is-pinned' : ''}`,
		attr: {
			type: 'button',
			'aria-label': row.pinned ? 'Unpin item' : 'Pin item',
			title: row.pinned ? 'Unpin' : 'Pin'
		}
	});
	pinBtn.setText(row.pinned ? 'Pinned' : 'Pin');
	pinBtn.addEventListener('click', (event) => {
		event.stopPropagation();
		onTogglePin?.(row);
	});
}

function renderDeleteButton(
	parent: HTMLElement,
	row: DashboardRow,
	onDelete: ((row: DashboardRow) => void) | undefined
): void {
	const deleteBtn = parent.createEl('button', {
		cls: 'speed-reader-dashboard-card__delete',
		attr: {
			type: 'button',
			'aria-label': `Delete ${row.typeLabel.toLowerCase()}`,
			title: `Delete ${row.typeLabel.toLowerCase()}`
		}
	});
	setIcon(deleteBtn, 'trash-2');
	deleteBtn.addEventListener('click', (event) => {
		event.stopPropagation();
		onDelete?.(row);
	});
}

export function renderReadingCard(
	parent: HTMLElement,
	row: DashboardRow,
	deps: DashboardCardDeps
): HTMLElement {
	const card = parent.createDiv({ cls: 'speed-reader-dashboard-card' });
	card.addEventListener('click', () => deps.onOpen(row));

	const surface = createSurface(card, row);
	if (row.surfaceKind === 'book') {
		void loadBookCover(
			deps.app,
			deps.services,
			deps.coverUrls,
			row.docKey,
			surface,
			deps.isDisposed
		);
	}

	renderCardMeta(card, row);

	const side = card.createDiv({ cls: 'speed-reader-dashboard-card__side' });
	renderDeleteButton(side, row, deps.onDelete);
	renderPinButton(side, row, deps.onTogglePin);
	const progress = side.createDiv({ cls: 'speed-reader-dashboard-card__progress' });
	renderProgressRing(progress, row.progressPercent);

	return card;
}

export function renderContinueReadingCard(
	parent: HTMLElement,
	row: DashboardRow | null,
	deps: DashboardCardDeps,
	onResume: () => void
): void {
	parent.empty();
	if (!row) {
		const empty = parent.createDiv({
			cls: 'speed-reader-dashboard-hero speed-reader-dashboard-hero--empty'
		});
		empty.createDiv({
			cls: 'speed-reader-dashboard-hero__eyebrow',
			text: 'Continue Reading'
		});
		empty.createDiv({
			cls: 'speed-reader-dashboard-hero__title',
			text: 'Nothing in progress yet'
		});
		empty.createDiv({
			cls: 'speed-reader-dashboard-hero__description',
			text: 'Open a book or note to start building your reading dashboard.'
		});
		return;
	}

	const hero = parent.createDiv({ cls: 'speed-reader-dashboard-hero' });
	const surface = createSurface(hero, row);
	surface.addClass('speed-reader-dashboard-hero__surface');
	if (row.surfaceKind === 'book') {
		void loadBookCover(
			deps.app,
			deps.services,
			deps.coverUrls,
			row.docKey,
			surface,
			deps.isDisposed
		);
	}

	const content = hero.createDiv({ cls: 'speed-reader-dashboard-hero__content' });
	content.createDiv({
		cls: 'speed-reader-dashboard-hero__eyebrow',
		text: 'Continue Reading'
	});

	const top = content.createDiv({ cls: 'speed-reader-dashboard-hero__topline' });
	top.createSpan({
		cls: 'speed-reader-dashboard-card__type-badge',
		text: row.typeLabel
	});
	if ('badgeLabel' in row) {
		top.createSpan({
			cls: `speed-reader-dashboard-card__mode-badge speed-reader-dashboard-card__mode-badge--${row.badge}`,
			text: row.badgeLabel
		});
	}

	content.createDiv({
		cls: 'speed-reader-dashboard-hero__title',
		text: row.title
	});
	content.createDiv({
		cls: 'speed-reader-dashboard-hero__secondary',
		text: 'author' in row && row.author ? row.author : row.lengthLabel
	});

	const actions = hero.createDiv({ cls: 'speed-reader-dashboard-hero__actions' });
	const progress = actions.createDiv({ cls: 'speed-reader-dashboard-hero__progress' });
	renderProgressRing(progress, row.progressPercent);
	const resumeBtn = actions.createEl('button', {
		cls: 'mod-cta speed-reader-dashboard-hero__resume',
		text: 'Resume',
		attr: { type: 'button' }
	});
	resumeBtn.addEventListener('click', (event) => {
		event.stopPropagation();
		onResume();
	});

	hero.addEventListener('click', onResume);
}

export function renderReadingShelf<T extends DashboardRow>(
	parent: HTMLElement,
	section: DashboardSection<T>,
	deps: DashboardCardDeps
): void {
	const shelf = parent.createDiv({ cls: 'speed-reader-dashboard-shelf' });
	const header = shelf.createDiv({ cls: 'speed-reader-dashboard-shelf__header' });
	header.createDiv({ cls: 'speed-reader-dashboard-shelf__title', text: section.title });
	header.createDiv({
		cls: 'speed-reader-dashboard-shelf__count',
		text: String(section.rows.length)
	});

	const grid = shelf.createDiv({ cls: 'speed-reader-dashboard-shelf__grid' });
	for (const row of section.rows) {
		renderReadingCard(grid, row, deps);
	}
}

export function renderEmptyStateCard(
	parent: HTMLElement,
	title: string,
	description: string
): void {
	const card = parent.createDiv({ cls: 'speed-reader-dashboard-empty' });
	card.createDiv({ cls: 'speed-reader-dashboard-empty__title', text: title });
	card.createDiv({
		cls: 'speed-reader-dashboard-empty__description',
		text: description
	});
}

export function renderLoadingSkeletonCards(
	parent: HTMLElement,
	count = 3
): void {
	const host = parent.createDiv({ cls: 'speed-reader-dashboard-skeletons' });
	for (let index = 0; index < count; index += 1) {
		const card = host.createDiv({ cls: 'speed-reader-dashboard-skeleton' });
		card.createDiv({ cls: 'speed-reader-dashboard-skeleton__surface' });
		const meta = card.createDiv({ cls: 'speed-reader-dashboard-skeleton__meta' });
		meta.createDiv({ cls: 'speed-reader-dashboard-skeleton__line is-short' });
		meta.createDiv({ cls: 'speed-reader-dashboard-skeleton__line' });
		meta.createDiv({ cls: 'speed-reader-dashboard-skeleton__line is-tiny' });
		card.createDiv({ cls: 'speed-reader-dashboard-skeleton__ring' });
	}
}
