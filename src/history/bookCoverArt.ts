import type { App } from 'obsidian';
import type { PluginServices } from '../services/serviceRegistry';
import { loadBookCoverUrl } from './bookCovers';
import { splitBookTitle } from './bookTitleCleanup';

export interface BookCoverArtDeps {
	app: App;
	services: PluginServices;
	/** Object URLs the caller revokes on re-render or close. */
	coverUrls: string[];
	isDisposed: () => boolean;
	/** When set, covers are loaded once and reused across re-renders. */
	coverCache?: BookCoverUrlCache;
}

/** Keeps one object URL per book so re-renders (search keystrokes, progress saves) don't flicker. */
export class BookCoverUrlCache {
	private readonly urls = new Map<string, string | null>();
	private readonly pending = new Map<string, Promise<string | null>>();

	constructor(
		private readonly app: App,
		private readonly bookCacheBase: string
	) {}

	peek(docKey: string): string | null | undefined {
		return this.urls.get(docKey);
	}

	load(docKey: string): Promise<string | null> {
		if (this.urls.has(docKey)) {
			return Promise.resolve(this.urls.get(docKey) ?? null);
		}
		let promise = this.pending.get(docKey);
		if (!promise) {
			promise = loadBookCoverUrl(this.app.vault.adapter, this.bookCacheBase, docKey).then(
				(url) => {
					this.pending.delete(docKey);
					this.urls.set(docKey, url);
					return url;
				}
			);
			this.pending.set(docKey, promise);
		}
		return promise;
	}

	invalidate(docKey: string): void {
		const url = this.urls.get(docKey);
		if (url) {
			URL.revokeObjectURL(url);
		}
		this.urls.delete(docKey);
	}

	dispose(): void {
		for (const url of this.urls.values()) {
			if (url) {
				URL.revokeObjectURL(url);
			}
		}
		this.urls.clear();
		this.pending.clear();
	}
}

function titleHue(title: string): number {
	let hash = 0;
	for (const char of title) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}
	return hash % 360;
}

/**
 * Fill `surface` with a typographic placeholder, then swap in the cached cover image
 * once it loads. The placeholder stays in the DOM and is hidden by `.has-cover`.
 */
export function renderBookCoverArt(
	surface: HTMLElement,
	book: { docKey: string; title: string; author?: string },
	deps: BookCoverArtDeps
): void {
	surface.addClass('srai-cover');
	surface.style.setProperty('--srai-cover-hue', String(titleHue(book.title)));
	const placeholder = surface.createDiv({ cls: 'srai-cover__placeholder' });
	placeholder.createDiv({
		cls: 'srai-cover__placeholder-title',
		text: splitBookTitle(book.title).main
	});
	if (book.author) {
		placeholder.createDiv({ cls: 'srai-cover__placeholder-author', text: book.author });
	}

	const applyUrl = (url: string): void => {
		surface.style.backgroundImage = `url("${url}")`;
		surface.addClass('has-cover');
	};

	const cache = deps.coverCache;
	if (cache) {
		const known = cache.peek(book.docKey);
		if (known !== undefined) {
			if (known) {
				applyUrl(known);
			}
			return;
		}
		void cache.load(book.docKey).then((url) => {
			if (url && !deps.isDisposed()) {
				applyUrl(url);
			}
		});
		return;
	}

	void loadBookCoverUrl(
		deps.app.vault.adapter,
		deps.services.dataPaths.bookCacheBase,
		book.docKey
	).then((url) => {
		if (!url) {
			return;
		}
		if (deps.isDisposed()) {
			URL.revokeObjectURL(url);
			return;
		}
		deps.coverUrls.push(url);
		applyUrl(url);
	});
}
