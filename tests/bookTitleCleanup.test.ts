import { describe, expect, it } from 'vitest';
import {
	bookDedupeKey,
	cleanBookFilename,
	splitBookTitle,
	stripTitleJunk
} from '../src/history/bookTitleCleanup';

describe('bookTitleCleanup', () => {
	it.each([
		['Siddhartha (Hermann Hesse) (z-library.sk, 1lib.sk, z-lib.sk).epub', 'Siddhartha', 'Hermann Hesse'],
		['The Catcher in the Rye by J. D. Salinger.epub', 'The Catcher in the Rye', 'J. D. Salinger'],
		[
			'Prince of Nothing 1 The Darkness that Comes Before by R. Scott Bakker.epub',
			'Prince of Nothing 1 The Darkness that Comes Before',
			'R. Scott Bakker'
		],
		['The Unbearable Lightness of Being (Milan Kundera.epub', 'The Unbearable Lightness of Being', 'Milan Kundera'],
		[
			'The Biggest Ideas in the Universe Space, Time, and Motion (Sean Carroll).epub',
			'The Biggest Ideas in the Universe Space, Time, and Motion',
			'Sean Carroll'
		]
	])('pulls the author out of %s', (input, title, author) => {
		expect(cleanBookFilename(input)).toEqual({ title, author });
	});

	it.each([
		['Prince of Nothing 1 The Darkness that Comes Before).epub', 'Prince of Nothing 1 The Darkness that Comes Before'],
		['Six Not-So-Easy Pieces ( etc.) (z-library.sk, 1lib.sk, z-lib.sk).epub', 'Six Not-So-Easy Pieces'],
		['Notes from Underground  The Double-Penguin Classics.epub', 'Notes from Underground The Double-Penguin Classics'],
		['Nausea.epub', 'Nausea'],
		['Stand by me.epub', 'Stand by me']
	])('cleans %s without inventing an author', (input, title) => {
		expect(cleanBookFilename(input)).toEqual({ title });
	});

	it('strips shadow-library domains from metadata titles', () => {
		expect(
			stripTitleJunk(
				'The Sense of Style The Thinking Person’s Guide Steven Pinker z-library.sk, 1lib.sk, z-lib.sk'
			)
		).toBe('The Sense of Style The Thinking Person’s Guide Steven Pinker');
		expect(stripTitleJunk('Brave New World')).toBe('Brave New World');
	});

	it('splits a subtitle after the first colon', () => {
		expect(splitBookTitle('Moonwalking With Einstein: The Art and Science of Remembering Everything')).toEqual({
			main: 'Moonwalking With Einstein',
			subtitle: 'The Art and Science of Remembering Everything'
		});
		expect(splitBookTitle('Nausea')).toEqual({ main: 'Nausea' });
	});

	it('gives copies of the same book the same dedupe key', () => {
		expect(bookDedupeKey('Siddhartha')).toBe(bookDedupeKey('siddhartha'));
		expect(bookDedupeKey('The Picture of Dorian Gray')).toBe(bookDedupeKey('Picture of Dorian Gray'));
		expect(bookDedupeKey('Psycho-Cybernetics: Updated and Expanded')).toBe(bookDedupeKey('Psycho-Cybernetics'));
	});
});
