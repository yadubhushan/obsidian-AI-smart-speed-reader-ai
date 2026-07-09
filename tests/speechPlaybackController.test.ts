import { describe, expect, it, vi } from 'vitest';
import {
	SpeechPlaybackController,
	clampTtsWpm,
	speechRateForWpm,
	type SpeechSynthesisLike
} from '../src/services/speechPlaybackController';
import type { ReaderState } from '../src/types';

function readerState(overrides: Partial<ReaderState> = {}): ReaderState {
	return {
		chunk: [{
			raw: 'Hello,',
			word: 'Hello',
			punctuation: ',',
			orpIndex: 1,
			start: 0,
			end: 6
		}],
		currentIndex: 0,
		totalWords: 2,
		progress: 0,
		isPlaying: true,
		finished: false,
		currentWpm: 200,
		timeRemainingMs: 600,
		currentHeading: null,
		playbackMode: 'rsvp',
		...overrides
	};
}

function harness() {
	const synthesis: SpeechSynthesisLike = {
		speak: vi.fn(),
		cancel: vi.fn()
	};
	const utterances: Array<{
		text: string;
		rate: number;
		onend?: () => void;
		onerror?: () => void;
	}> = [];
	const controller = new SpeechPlaybackController({
		getSynthesis: () => synthesis,
		createUtterance: (text) => {
			const utterance = { text, rate: 1 };
			utterances.push(utterance);
			return utterance as SpeechSynthesisUtterance;
		}
	});
	return { controller, synthesis, utterances };
}

describe('SpeechPlaybackController', () => {
	it('speaks the displayed chunk at a WPM-derived rate', () => {
		const { controller, synthesis, utterances } = harness();

		controller.sync(readerState({ currentWpm: 400 }), true);

		expect(utterances[0]).toEqual(expect.objectContaining({ text: 'Hello,', rate: 2.5 }));
		expect(synthesis.speak).toHaveBeenCalledTimes(1);
	});

	it('does not repeat speech for unrelated renders of the same state', () => {
		const { controller, synthesis } = harness();
		const state = readerState();

		controller.sync(state, true);
		controller.sync({ ...state }, true);

		expect(synthesis.speak).toHaveBeenCalledTimes(1);
	});

	it('repeats an identical chunk when the engine emits a new playback sequence', () => {
		const { controller, synthesis } = harness();

		controller.sync(readerState({ playbackMode: 'lineRepeat', speechSequence: 4 }), true);
		controller.sync(readerState({ playbackMode: 'lineRepeat', speechSequence: 5 }), true);

		expect(synthesis.speak).toHaveBeenCalledTimes(2);
	});

	it('restarts the current chunk when WPM changes', () => {
		const { controller, synthesis, utterances } = harness();

		controller.sync(readerState({ currentWpm: 200 }), true);
		controller.sync(readerState({ currentWpm: 300 }), true);

		expect(synthesis.speak).toHaveBeenCalledTimes(2);
		expect(utterances[1]?.rate).toBe(1.875);
	});

	it('queues a new chunk without cutting off active speech', () => {
		const { controller, synthesis, utterances } = harness();
		controller.sync(readerState(), true);

		controller.sync(readerState({
			currentIndex: 1,
			chunk: [{
				raw: 'world.',
				word: 'world',
				punctuation: '.',
				orpIndex: 1,
				start: 7,
				end: 13
			}]
		}), true);

		expect(utterances.map((item) => item.text)).toEqual(['Hello,', 'world.']);
		expect(synthesis.cancel).not.toHaveBeenCalled();
		expect(synthesis.speak).toHaveBeenCalledTimes(2);
	});

	it.each([
		['paused', readerState({ isPlaying: false }), true],
		['finished', readerState({ finished: true }), true],
		['disabled', readerState(), false]
	])('cancels when %s', (_label, state, enabled) => {
		const { controller, synthesis } = harness();
		controller.sync(readerState(), true);

		controller.sync(state, enabled);

		expect(synthesis.cancel).toHaveBeenCalledTimes(1);
	});

	it('bounds the asynchronous speech queue and resumes after completion', () => {
		const { controller, synthesis, utterances } = harness();
		for (let index = 0; index < 6; index += 1) {
			controller.sync(readerState({
				currentIndex: index,
				speechSequence: index,
				chunk: [{
					raw: `word${index}`,
					word: `word${index}`,
					punctuation: '',
					orpIndex: 1,
					start: index,
					end: index + 1
				}]
			}), true);
		}
		expect(synthesis.speak).toHaveBeenCalledTimes(4);

		utterances[0]?.onend?.();
		controller.sync(readerState({
			currentIndex: 6,
			speechSequence: 6,
			chunk: [{
				raw: 'resumed',
				word: 'resumed',
				punctuation: '',
				orpIndex: 1,
				start: 6,
				end: 7
			}]
		}), true);

		expect(synthesis.speak).toHaveBeenCalledTimes(5);
	});

	it('contains speech-engine errors without blocking playback', () => {
		const synthesis: SpeechSynthesisLike = {
			speak: vi.fn(() => {
				throw new Error('voice unavailable');
			}),
			cancel: vi.fn()
		};
		const controller = new SpeechPlaybackController({
			getSynthesis: () => synthesis,
			createUtterance: (text) => ({ text, rate: 1 }) as SpeechSynthesisUtterance
		});

		expect(() => controller.sync(readerState(), true)).not.toThrow();
	});

	it('gracefully ignores unavailable speech synthesis', () => {
		const controller = new SpeechPlaybackController({
			getSynthesis: () => null,
			createUtterance: vi.fn()
		});

		expect(() => controller.sync(readerState(), true)).not.toThrow();
	});

	it('uses display token text when the chunk has no words', () => {
		const { controller, utterances } = harness();
		controller.sync(readerState({
			chunk: [],
			displayToken: { kind: 'heading', text: 'Introduction' }
		}), true);

		expect(utterances[0]?.text).toBe('Introduction');
	});

	it('uses the selected installed voice and falls back when unavailable', () => {
		const voice = { voiceURI: 'voice://alex' } as SpeechSynthesisVoice;
		const synthesis: SpeechSynthesisLike = {
			speak: vi.fn(),
			cancel: vi.fn(),
			getVoices: () => [voice]
		};
		const utterances: SpeechSynthesisUtterance[] = [];
		const controller = new SpeechPlaybackController({
			getSynthesis: () => synthesis,
			createUtterance: (text) => {
				const utterance = { text, rate: 1, voice: null } as SpeechSynthesisUtterance;
				utterances.push(utterance);
				return utterance;
			}
		});

		controller.sync(readerState({ speechSequence: 1 }), true, 'voice://alex');
		controller.sync(readerState({ speechSequence: 2 }), true, 'voice://missing');

		expect(utterances[0]?.voice).toBe(voice);
		expect(utterances[1]?.voice).toBeNull();
	});

	it('clamps speech rates to browser-safe values', () => {
		expect(speechRateForWpm(1)).toBe(0.1);
		expect(speechRateForWpm(160)).toBe(1);
		expect(speechRateForWpm(5000)).toBe(10);
	});

	it('limits TTS playback to a reliable visual speed', () => {
		expect(clampTtsWpm(300)).toBe(300);
		expect(clampTtsWpm(900)).toBe(450);
	});
});
