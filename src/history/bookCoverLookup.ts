import type { App } from 'obsidian';
import {
	bookCacheCoverOptionsPath,
	bookCacheCoverPath,
	bookCacheCustomCoverPath,
	bookCacheDocKeyPath
} from '../store/bookCachePaths';
import type { BookCacheIndex } from '../types/m2Contracts';

type FetchLike = typeof fetch;

/** Open Library rate-limits ISBN cover lookups hard; offer only a few. */
const MAX_OPEN_LIBRARY_OPTIONS = 3;

export class CoverLookupRateLimitError extends Error {
	constructor() {
		super('Cover search is rate-limited right now. Try again later.');
		this.name = 'CoverLookupRateLimitError';
	}
}

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

interface OpenLibrarySearchResponse {
	docs?: Array<{ title?: string; author_name?: string[]; cover_i?: number; isbn?: string[] }>;
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

function openLibrarySearchUrl(title: string, author?: string): string {
	const params = new URLSearchParams({ title, limit: '8', fields: 'title,author_name,cover_i,isbn' });
	if (author) {
		params.set('author', author);
	}
	return `https://openlibrary.org/search.json?${params.toString()}`;
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

/**
 * Keyless Google Books requests count against one quota shared by every anonymous caller,
 * so a 429 there says nothing about our own volume. Fall back to Open Library search then,
 * and only report a rate limit when neither source answers.
 */
export async function findBookCoverOptions(
	title: string,
	author: string | undefined,
	fetchImpl: FetchLike
): Promise<BookCoverOption[]> {
	let googleError: unknown = null;
	try {
		const options = await findGoogleBookCoverOptions(title, author, fetchImpl);
		if (options.length > 0) {
			return options;
		}
	} catch (error) {
		googleError = error;
	}
	try {
		return await findOpenLibraryCoverOptions(title, author, fetchImpl);
	} catch (error) {
		if (googleError === null) {
			return [];
		}
		if (googleError instanceof CoverLookupRateLimitError || error instanceof CoverLookupRateLimitError) {
			throw new CoverLookupRateLimitError();
		}
		throw googleError;
	}
}

async function findGoogleBookCoverOptions(
	title: string,
	author: string | undefined,
	fetchImpl: FetchLike
): Promise<BookCoverOption[]> {
	const res = await fetchImpl(googleBookSearchUrl(title, author));
	if (res.status === 429) {
		throw new CoverLookupRateLimitError();
	}
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

	for (const isbn of [...isbns].slice(0, MAX_OPEN_LIBRARY_OPTIONS)) {
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

async function findOpenLibraryCoverOptions(
	title: string,
	author: string | undefined,
	fetchImpl: FetchLike
): Promise<BookCoverOption[]> {
	const res = await fetchImpl(openLibrarySearchUrl(title, author));
	if (res.status === 429) {
		throw new CoverLookupRateLimitError();
	}
	if (!res.ok) {
		throw new Error(`Open Library error: ${res.status}`);
	}

	const data = (await res.json()) as OpenLibrarySearchResponse;
	const options: BookCoverOption[] = [];
	const seen = new Set<number>();
	for (const doc of data.docs ?? []) {
		if (!doc.cover_i || seen.has(doc.cover_i)) {
			continue;
		}
		seen.add(doc.cover_i);
		options.push({
			provider: 'open-library',
			url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
			title: doc.title,
			author: doc.author_name?.join(', '),
			isbn: doc.isbn?.[0]
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
	fetchImpl: FetchLike
): Promise<{ options: BookCoverOption[]; wroteCover: boolean }> {
	const adapter = app.vault.adapter;
	const coverPath = bookCacheCoverPath(bookCacheBase, index.docKey);
	// The EPUB's own cover (or one the user picked) wins; only go online when there is none.
	if (
		(await adapter.exists(coverPath)) ||
		(await adapter.exists(bookCacheCustomCoverPath(bookCacheBase, index.docKey)))
	) {
		return { options: [], wroteCover: false };
	}

	await adapter.mkdir(bookCacheDocKeyPath(bookCacheBase, index.docKey)).catch(() => undefined);
	const options = await findBookCoverOptions(index.title, index.author, fetchImpl).catch(() => []);
	if (options.length > 0) {
		await adapter.write(
			bookCacheCoverOptionsPath(bookCacheBase, index.docKey),
			JSON.stringify({ sourcePath: index.sourcePath, title: index.title, author: index.author, options }, null, 2)
		);
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
