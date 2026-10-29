import { describe, expect, it, vi } from 'vitest';
import { findBookCoverOptions } from '../src/history/bookCoverLookup';

describe('bookCoverLookup', () => {
	it('uses Google Books image links first and adds Open Library ISBN options', async () => {
		const fetchImpl = vi.fn(async () =>
			new Response(
				JSON.stringify({
					items: [
						{
							volumeInfo: {
								title: 'Atomic Habits',
								authors: ['James Clear'],
								industryIdentifiers: [
									{ type: 'ISBN_13', identifier: '9780735211292' }
								],
								imageLinks: {
									thumbnail: 'http://books.google.com/thumb',
									extraLarge: 'http://books.google.com/extra'
								}
							}
						}
					]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		) as unknown as typeof fetch;

		const options = await findBookCoverOptions('Atomic Habits', 'James Clear', fetchImpl);

		expect(fetchImpl).toHaveBeenCalledWith(
			'https://www.googleapis.com/books/v1/volumes?q=intitle%3AAtomic%20Habits%2Binauthor%3AJames%20Clear&printType=books&maxResults=5'
		);
		expect(options).toEqual([
			{
				provider: 'google-books',
				url: 'https://books.google.com/extra',
				title: 'Atomic Habits',
				author: 'James Clear',
				isbn: '9780735211292'
			},
			{
				provider: 'open-library',
				url: 'https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg?default=false',
				title: 'Atomic Habits',
				author: 'James Clear',
				isbn: '9780735211292'
			}
		]);
	});
});

describe('bookCoverLookup rate limits', () => {
	const json = (body: unknown) =>
		new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

	it('falls back to Open Library search when Google Books answers 429', async () => {
		const fetchImpl = vi.fn(async (url: string) =>
			url.startsWith('https://www.googleapis.com/')
				? new Response(null, { status: 429 })
				: json({ docs: [{ title: 'Nausea', author_name: ['Jean-Paul Sartre'], cover_i: 42, isbn: ['111'] }, { cover_i: 42 }] })
		) as unknown as typeof fetch;

		const options = await findBookCoverOptions('Nausea', 'Sartre', fetchImpl);

		expect(fetchImpl).toHaveBeenLastCalledWith(
			'https://openlibrary.org/search.json?title=Nausea&limit=8&fields=title%2Cauthor_name%2Ccover_i%2Cisbn&author=Sartre'
		);
		expect(options).toEqual([
			{
				provider: 'open-library',
				url: 'https://covers.openlibrary.org/b/id/42-L.jpg',
				title: 'Nausea',
				author: 'Jean-Paul Sartre',
				isbn: '111'
			}
		]);
	});

	it('reports a rate limit only when both sources fail', async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 429 })) as unknown as typeof fetch;
		await expect(findBookCoverOptions('Nausea', undefined, fetchImpl)).rejects.toThrow(/rate-limited/);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});
});
