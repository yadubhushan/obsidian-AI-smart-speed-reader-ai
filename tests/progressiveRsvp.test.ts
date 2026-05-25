/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseDocument } from '../src/services/textParser';
import { calculateORP } from '../src/services/textParser';
import {
	collectProgressiveLegacyBundleTexts,
	getProgressiveLegacyChunk,
	getProgressiveWordTokensChunk,
	progressivePrimaryDisplayToken,
	progressiveWordsToDisplayChunk
} from '../src/engine/progressiveRsvp';
import { RSVPEngine } from '../src/engine/rsvpEngine';
import { DEFAULT_SETTINGS, type ReaderState, type SpeedReaderAiSettings } from '../src/types';
import type { StreamToken } from '../src/types/processedDocument';

describe('progressiveRsvp', () => {
	it('bundles the scratch-pad sentence with threshold 3', () => {
		const { words } = parseDocument('I am going to the party');
		expect(collectProgressiveLegacyBundleTexts(words, 3)).toEqual([
			'I am',
			'going',
			'to the',
			'party'
		]);
	});

	it('bundles all-short words into one flash unit', () => {
		const { words } = parseDocument('I am ok');
		expect(collectProgressiveLegacyBundleTexts(words, 3)).toEqual(['I am ok']);
	});

	it('shows all-long words one at a time', () => {
		const { words } = parseDocument('going running quickly');
		expect(collectProgressiveLegacyBundleTexts(words, 3)).toEqual([
			'going',
			'running',
			'quickly'
		]);
	});

	it('uses letter count without attached punctuation', () => {
		const { words } = parseDocument('to the party.');
		expect(collectProgressiveLegacyBundleTexts(words, 3)).toEqual(['to the', 'party.']);
		expect(words.find((word) => word.word === 'party')?.punctuation).toBe('.');
	});

	it('joins bundled words for display with combined ORP', () => {
		const { words } = parseDocument('I am going');
		const { words: bundle } = getProgressiveLegacyChunk(words, 0, 3);
		const display = progressiveWordsToDisplayChunk(bundle);

		expect(display).toHaveLength(1);
		expect(display[0]?.word).toBe('I am');
		expect(display[0]?.orpIndex).toBe(calculateORP('I am'));
	});

	it('bundles manifest word tokens the same way', () => {
		const stream: StreamToken[] = [
			{ kind: 'word', text: 'I' },
			{ kind: 'word', text: 'am' },
			{ kind: 'word', text: 'going' },
			{ kind: 'word', text: 'to' },
			{ kind: 'word', text: 'the' },
			{ kind: 'word', text: 'party' }
		];

		const bundles: string[] = [];
		let index = 0;
		while (index < stream.length) {
			const { tokens, endIndex } = getProgressiveWordTokensChunk(stream, index, 3);
			bundles.push(tokens.map((token) => token.text ?? '').join(' '));
			index = endIndex;
		}

		expect(bundles).toEqual(['I am', 'going', 'to the', 'party']);
	});

	it('shows non-word manifest tokens alone', () => {
		const stream: StreamToken[] = [
			{ kind: 'word', text: 'I' },
			{ kind: 'pause', pauseMs: 400 },
			{ kind: 'word', text: 'am' }
		];

		const first = getProgressiveWordTokensChunk(stream, 0, 3);
		expect(first.tokens).toEqual([{ kind: 'word', text: 'I' }]);
		expect(first.endIndex).toBe(1);

		const pause = getProgressiveWordTokensChunk(stream, 1, 3);
		expect(pause.tokens[0]?.kind).toBe('pause');
		expect(pause.endIndex).toBe(2);
	});

	it('uses combined ORP for progressive manifest display token', () => {
		const token = progressivePrimaryDisplayToken([
			{ kind: 'word', text: 'to' },
			{ kind: 'word', text: 'the' }
		]);

		expect(token).toEqual({
			kind: 'word',
			text: 'to the',
			orpIndex: calculateORP('to the')
		});
	});
});

describe('RSVPEngine progressive RSVP wiring', () => {
	let engine: RSVPEngine;
	let stateChanges: ReaderState[];
	const settings: SpeedReaderAiSettings = structuredClone(DEFAULT_SETTINGS);

	beforeEach(() => {
		vi.useFakeTimers();
		stateChanges = [];
		engine = new RSVPEngine(
			settings,
			(state) => stateChanges.push(state),
			() => undefined
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('uses chunk size 1 in RSVP mode even when chunkSize setting is larger', () => {
		settings.reader.chunkSize = 3;
		engine.setSettings(settings);
		engine.setPlaybackMode('rsvp');
		engine.loadText('one two three four five six');
		engine.play();

		expect(stateChanges[stateChanges.length - 1]?.chunk[0]?.word).toBe('one');
		vi.advanceTimersByTime(60000 / settings.reader.wpm);
		expect(stateChanges[stateChanges.length - 1]?.currentIndex).toBe(1);
	});

	it('uses smart bundling in progressive RSVP mode', () => {
		settings.reader.progressiveRsvpMaxWordLength = 3;
		engine.setSettings(settings);
		engine.setPlaybackMode('progressiveRsvp');
		engine.loadText('I am going to the party');
		engine.play();

		expect(stateChanges[stateChanges.length - 1]?.chunk[0]?.word).toBe('I am');
		vi.advanceTimersByTime(60000 / settings.reader.wpm);
		expect(stateChanges[stateChanges.length - 1]?.chunk[0]?.word).toBe('going');
	});
});
