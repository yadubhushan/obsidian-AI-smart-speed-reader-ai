import { Modal, Notice, type App } from 'obsidian';
import type { PluginServices } from '../services/serviceRegistry';
import {
	CoverLookupRateLimitError,
	findBookCoverOptions,
	type BookCoverOption
} from './bookCoverLookup';
import { coverFetch } from './coverFetch';
import { clearCustomBookCover, hasCustomBookCover, saveCustomBookCover } from './bookCovers';
import { splitBookTitle } from './bookTitleCleanup';

export interface CoverPickerBook {
	sourcePath: string;
	docKey: string;
	title: string;
	author?: string;
}

/** Search results per query for this session; reopening the picker shouldn't re-query. */
const searchCache = new Map<string, BookCoverOption[]>();

async function downloadCover(url: string): Promise<ArrayBuffer | null> {
	const res = await coverFetch(url);
	if (!res.ok) {
		return null;
	}
	const contentType = res.headers.get('content-type') ?? '';
	if (contentType && !contentType.toLowerCase().startsWith('image/')) {
		return null;
	}
	const bytes = await res.arrayBuffer();
	return bytes.byteLength > 0 ? bytes : null;
}

class CoverPickerModal extends Modal {
	private titleQuery: string;
	private authorQuery: string;
	private statusEl: HTMLElement | null = null;
	private gridEl: HTMLElement | null = null;
	private busy = false;

	constructor(
		app: App,
		private readonly services: PluginServices,
		private readonly book: CoverPickerBook
	) {
		super(app);
		this.titleQuery = splitBookTitle(book.title).main;
		this.authorQuery = book.author ?? '';
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass('srai-lib-dialog', 'srai-lib-cover-dialog');
		contentEl.empty();
		this.titleEl.setText('Change cover');
		contentEl.createEl('p', {
			cls: 'srai-lib-dialog__hint',
			text: 'Searches Google Books and Open Library. Only the title and author you enter are sent.'
		});

		const form = contentEl.createEl('form', { cls: 'srai-lib-cover-dialog__search' });
		const titleInput = form.createEl('input', {
			type: 'text',
			value: this.titleQuery,
			attr: { placeholder: 'Title', 'aria-label': 'Title' }
		});
		const authorInput = form.createEl('input', {
			type: 'text',
			value: this.authorQuery,
			attr: { placeholder: 'Author', 'aria-label': 'Author' }
		});
		form.createEl('button', { text: 'Search', cls: 'mod-cta', attr: { type: 'submit' } });
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			this.titleQuery = titleInput.value.trim();
			this.authorQuery = authorInput.value.trim();
			void this.search();
		});

		this.statusEl = contentEl.createDiv({ cls: 'srai-lib-cover-dialog__status' });
		this.gridEl = contentEl.createDiv({ cls: 'srai-lib-cover-dialog__grid' });

		const footer = contentEl.createDiv({ cls: 'srai-lib-cover-dialog__footer' });
		void hasCustomBookCover(
			this.app.vault.adapter,
			this.services.dataPaths.bookCacheBase,
			this.book.docKey
		).then((hasCustom) => {
			if (!hasCustom) {
				return;
			}
			const restore = footer.createEl('button', {
				text: 'Restore EPUB cover',
				attr: { type: 'button' }
			});
			restore.addEventListener('click', () => void this.restoreOriginal());
		});

		void this.search();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private setStatus(text: string): void {
		this.statusEl?.setText(text);
	}

	private async search(): Promise<void> {
		if (!this.gridEl || !this.titleQuery) {
			this.setStatus('Enter a title to search.');
			return;
		}
		const grid = this.gridEl;
		grid.empty();
		this.setStatus('Searching…');
		const cacheKey = `${this.titleQuery}\u0000${this.authorQuery}`.toLowerCase();
		let options = searchCache.get(cacheKey);
		if (!options) {
			try {
				options = await findBookCoverOptions(
					this.titleQuery,
					this.authorQuery || undefined,
					coverFetch
				);
				searchCache.set(cacheKey, options);
			} catch (error) {
				if (error instanceof CoverLookupRateLimitError) {
					this.setStatus(error.message);
					return;
				}
				const message = error instanceof Error ? error.message : String(error);
				this.setStatus(`Search failed: ${message}`);
				return;
			}
		}
		if (options.length === 0) {
			this.setStatus('No covers found. Try a shorter title or drop the author.');
			return;
		}
		this.setStatus('Select a cover.');
		for (const option of options) {
			this.renderOption(grid, option);
		}
	}

	private renderOption(grid: HTMLElement, option: BookCoverOption): void {
		const button = grid.createEl('button', {
			cls: 'srai-lib-cover-dialog__option',
			attr: {
				type: 'button',
				title: [option.title, option.author, option.provider].filter(Boolean).join(' · ')
			}
		});
		const img = button.createEl('img', {
			attr: { src: option.url, alt: option.title ?? 'Cover', loading: 'lazy' }
		});
		img.addEventListener('error', () => button.remove());
		button.createSpan({
			cls: 'srai-lib-cover-dialog__provider',
			text: option.provider === 'google-books' ? 'Google Books' : 'Open Library'
		});
		button.addEventListener('click', () => void this.choose(option, button));
	}

	private async choose(option: BookCoverOption, button: HTMLElement): Promise<void> {
		if (this.busy) {
			return;
		}
		this.busy = true;
		button.addClass('is-loading');
		this.setStatus('Saving cover…');
		try {
			const bytes = await downloadCover(option.url);
			if (!bytes) {
				this.setStatus('That image could not be downloaded. Pick another.');
				return;
			}
			await saveCustomBookCover(
				this.app.vault.adapter,
				this.services.dataPaths.bookCacheBase,
				this.book.docKey,
				bytes
			);
			this.notifyCoverChanged();
			new Notice('Cover updated.');
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.setStatus(`Could not save cover: ${message}`);
		} finally {
			this.busy = false;
			button.removeClass('is-loading');
		}
	}

	private async restoreOriginal(): Promise<void> {
		await clearCustomBookCover(
			this.app.vault.adapter,
			this.services.dataPaths.bookCacheBase,
			this.book.docKey
		);
		this.notifyCoverChanged();
		new Notice('Restored the EPUB cover.');
		this.close();
	}

	private notifyCoverChanged(): void {
		this.services.eventBus.emit('book-cache-updated', {
			docKey: this.book.docKey,
			sourcePath: this.book.sourcePath
		});
	}
}

export function openCoverPicker(app: App, services: PluginServices, book: CoverPickerBook): void {
	new CoverPickerModal(app, services, book).open();
}
