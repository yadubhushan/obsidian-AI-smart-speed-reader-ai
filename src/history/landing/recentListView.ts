import { Menu, Notice, setIcon, type App } from 'obsidian';
import { bookCacheCoverPath } from '../../store/bookCachePaths';
import type { PluginServices } from '../../services/serviceRegistry';
import type { PlaybackMode } from '../../types';
import { toggleHistoryPin } from '../historyPinActions';
import { formatRelativeDate } from './formatRelativeDate';
import type { RecentHistoryRow } from './recentListModel';

export interface RecentListViewDeps {
	app: App;
	services: PluginServices;
	onStateChanged: () => void;
}

export interface RecentListViewHandle {
	refresh(rows: RecentHistoryRow[]): void;
	destroy(): void;
}

const EMPTY_MESSAGE = 'Nothing in progress yet. Open a book or note to start.';

function noteInitials(title: string): string {
	const words = title.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) {
		return 'N';
	}
	if (words.length === 1) {
		const word = words[0] ?? '';
		return word.slice(0, 2).toUpperCase();
	}
	const first = words[0]?.[0] ?? '';
	const second = words[1]?.[0] ?? '';
	return `${first}${second}`.toUpperCase();
}

export function renderRecentListView(
	container: HTMLElement,
	deps: RecentListViewDeps
): RecentListViewHandle {
	const { app, services, onStateChanged } = deps;
	const coverUrls: string[] = [];
	let disposed = false;

	const listHost = container.createDiv({ cls: 'speed-reader-landing-recent-list' });

	async function loadCover(coverEl: HTMLElement, docKey: string): Promise<void> {
		if (disposed) {
			return;
		}
		const coverPath = bookCacheCoverPath(services.dataPaths.bookCacheBase, docKey);
		try {
			const exists = await app.vault.adapter.exists(coverPath);
			if (!exists || disposed) {
				coverEl.addClass('speed-reader-landing-recent-card__thumb--placeholder');
				return;
			}
			const bytes = await app.vault.adapter.readBinary(coverPath);
			const blob = new Blob([bytes], { type: 'image/jpeg' });
			const url = URL.createObjectURL(blob);
			coverUrls.push(url);
			if (disposed) {
				URL.revokeObjectURL(url);
				return;
			}
			coverEl.style.backgroundImage = `url("${url}")`;
			coverEl.removeClass('speed-reader-landing-recent-card__thumb--placeholder');
		} catch {
			coverEl.addClass('speed-reader-landing-recent-card__thumb--placeholder');
		}
	}

	function renderRow(row: RecentHistoryRow): void {
		const card = listHost.createDiv({ cls: 'speed-reader-landing-recent-card' });
		card.setAttribute('data-path', row.sourcePath);

		const thumb = card.createDiv({
			cls: `speed-reader-landing-recent-card__thumb${
				row.sourceKind === 'note'
					? ' speed-reader-landing-recent-card__thumb--note'
					: ' speed-reader-landing-recent-card__thumb--book'
			}`
		});

		if (row.sourceKind === 'note') {
			thumb.createSpan({
				cls: 'speed-reader-landing-recent-card__initials',
				text: noteInitials(row.title)
			});
		} else {
			void loadCover(thumb, row.docKey);
		}

		const body = card.createDiv({ cls: 'speed-reader-landing-recent-card__body' });

		const top = body.createDiv({ cls: 'speed-reader-landing-recent-card__top' });
		const titleBlock = top.createDiv({ cls: 'speed-reader-landing-recent-card__title-block' });
		titleBlock.createDiv({ cls: 'speed-reader-landing-recent-card__title', text: row.title });
		titleBlock.createDiv({ cls: 'speed-reader-landing-recent-card__subtitle', text: row.subtitle });

		const actions = top.createDiv({ cls: 'speed-reader-landing-recent-card__actions' });
		const relativeDate = formatRelativeDate(row.lastOpenedAt);
		if (relativeDate) {
			actions.createSpan({ cls: 'speed-reader-landing-recent-card__date', text: relativeDate });
		}

		const menuBtn = actions.createEl('button', {
			cls: 'speed-reader-landing-recent-card__menu',
			attr: { type: 'button', 'aria-label': 'More actions' },
			text: '⋯'
		});

		menuBtn.addEventListener('click', (event) => {
			event.stopPropagation();
			const menu = new Menu();
			menu.addItem((item) => {
				item.setTitle(row.pinned ? 'Unpin' : 'Pin');
				item.setIcon(row.pinned ? 'pin-off' : 'pin');
				item.onClick(() => {
					void toggleHistoryPin(services, row.sourcePath).then((ok) => {
						if (ok) {
							onStateChanged();
						}
					});
				});
			});
			menu.showAtMouseEvent(event);
		});

		const progressRow = body.createDiv({ cls: 'speed-reader-landing-recent-card__progress-row' });
		const track = progressRow.createDiv({ cls: 'speed-reader-landing-recent-card__progress-track' });
		track.createDiv({
			cls: `speed-reader-landing-recent-card__progress-fill${
				row.sourceKind === 'note' ? ' is-note' : ''
			}`,
			attr: { style: `width: ${Math.min(100, Math.max(0, row.progressPercent))}%` }
		});
		progressRow.createSpan({
			cls: 'speed-reader-landing-recent-card__progress-label',
			text: `${Math.round(row.progressPercent)}%`
		});

		card.addEventListener('click', () => {
			void services.readerGate
				.open({
					sourcePath: row.sourcePath,
					sourceKind: row.sourceKind,
					initialPosition: row.initialPosition,
					playbackMode: row.playbackMode as PlaybackMode | undefined
				})
				.catch((error: unknown) => {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Could not open: ${message}`);
				});
		});
	}

	function refresh(rows: RecentHistoryRow[]): void {
		if (disposed) {
			return;
		}
		for (const url of coverUrls) {
			URL.revokeObjectURL(url);
		}
		coverUrls.length = 0;
		listHost.empty();

		if (rows.length === 0) {
			listHost.createDiv({ cls: 'speed-reader-landing-recent-empty', text: EMPTY_MESSAGE });
			return;
		}

		for (const row of rows) {
			renderRow(row);
		}
	}

	return {
		refresh,
		destroy: () => {
			disposed = true;
			for (const url of coverUrls) {
				URL.revokeObjectURL(url);
			}
			coverUrls.length = 0;
			container.empty();
		}
	};
}
