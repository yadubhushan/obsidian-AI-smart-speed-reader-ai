import type { App } from 'obsidian';
import {
	bookCacheCoverOptionsPath,
	bookCacheCoverPath,
	bookCacheDocKeyPath
} from '../store/bookCachePaths';
import type { BookCacheIndex } from '../types/m2Contracts';

type FetchLike = typeof fetch;

export interface BookCoverOption {
	provider: 'google-books' | 'open-library';
	url: string;
	title?: string;
	author?: string;
	isbn?: string;
}

interface GoogleBooksVolume {
	volumeInfo?: {
		title?: string;
		authors?: string[];
		industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
		imageLinks?: Partial<Record<'smallThumbnail' | 'thumbnail' | 'small' | 'medium' | 'large' | 'extraLarge', string>>;
	};
}

interface GoogleBooksResponse {
	items?: GoogleBooksVolume[];
}

const GOOGLE_IMAGE_KEYS = [
	'extraLarge',
	'large',
	'medium',
	'thumbnail',
	'small',
	'smallThumbnail'
] as const;

function httpsUrl(url: string | undefined): string | null {
	if (!url) {
		return null;
	}
	return url.replace(/^http:\/\//i, 'https://');
}

function googleBookSearchUrl(title: string, author?: string): string {
	const terms = author ? `intitle:${title}+inauthor:${author}` : `intitle:${title}`;
	return (
		`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(terms)}` +
		'&printType=books&maxResults=5'
	);
}

function bestGoogleImage(volume: GoogleBooksVolume): string | null {
	const links = volume.volumeInfo?.imageLinks;
	if (!links) {
		return null;
	}
	for (const key of GOOGLE_IMAGE_KEYS) {
		const url = httpsUrl(links[key]);
		if (url) {
			return url;
		}
	}
	return null;
}

function extractIsbn(volume: GoogleBooksVolume): string | undefined {
	const identifiers = volume.volumeInfo?.industryIdentifiers ?? [];
	return identifiers.find((item) => item.type === 'ISBN_13')?.identifier ??
		identifiers.find((item) => item.type === 'ISBN_10')?.identifier;
}

export async function findBookCoverOptions(
	title: string,
	author?: string,
	fetchImpl: FetchLike = fetch
): Promise<BookCoverOption[]> {
	const res = await fetchImpl(googleBookSearchUrl(title, author));
	if (!res.ok) {
		throw new Error(`Google Books error: ${res.status}`);
	}

	const data = (await res.json()) as GoogleBooksResponse;
	const options: BookCoverOption[] = [];
	const seen = new Set<string>();
	const isbns = new Set<string>();

	for (const item of data.items ?? []) {
		const url = bestGoogleImage(item);
		const isbn = extractIsbn(item);
		if (isbn) {
			isbns.add(isbn);
		}
		if (!url || seen.has(url)) {
			continue;
		}
		seen.add(url);
		options.push({
			provider: 'google-books',
			url,
			title: item.volumeInfo?.title,
			author: item.volumeInfo?.authors?.join(', '),
			isbn
		});
	}

	for (const isbn of isbns) {
		const url = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`;
		if (seen.has(url)) {
			continue;
		}
		seen.add(url);
		options.push({
			provider: 'open-library',
			url,
			title,
			author,
			isbn
		});
	}

	return options;
}

async function downloadImage(url: string, fetchImpl: FetchLike): Promise<ArrayBuffer | null> {
	const res = await fetchImpl(url);
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

export async function ensureBookCoverAssetsBeforeEpubDelete(
	app: App,
	bookCacheBase: string,
	index: BookCacheIndex,
	fetchImpl: FetchLike = fetch
): Promise<{ options: BookCoverOption[]; wroteCover: boolean }> {
	const adapter = app.vault.adapter;
	await adapter.mkdir(bookCacheDocKeyPath(bookCacheBase, index.docKey)).catch(() => undefined);

	const options = await findBookCoverOptions(index.title, index.author, fetchImpl).catch(() => []);
	if (options.length > 0) {
		await adapter.write(
			bookCacheCoverOptionsPath(bookCacheBase, index.docKey),
			JSON.stringify({ sourcePath: index.sourcePath, title: index.title, author: index.author, options }, null, 2)
		);
	}

	const coverPath = bookCacheCoverPath(bookCacheBase, index.docKey);
	if (await adapter.exists(coverPath)) {
		return { options, wroteCover: false };
	}

	for (const option of options) {
		const bytes = await downloadImage(option.url, fetchImpl).catch(() => null);
		if (!bytes) {
			continue;
		}
		await adapter.writeBinary(coverPath, bytes);
		return { options, wroteCover: true };
	}

	return { options, wroteCover: false };
}
