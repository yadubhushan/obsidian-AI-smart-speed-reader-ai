import type { ReaderState } from '../types';

// Add headroom so an utterance completes before the next visual timer tick.
const BASELINE_WPM = 160;
const MIN_SPEECH_RATE = 0.1;
const MAX_SPEECH_RATE = 10;
const MAX_BUFFERED_UTTERANCES = 4;
/** Per-chunk speech becomes unreliable above this speed on common device voices. */
export const MAX_TTS_WPM = 450;

export interface SpeechSynthesisLike {
	speak(utterance: SpeechSynthesisUtterance): void;
	cancel(): void;
	getVoices?(): SpeechSynthesisVoice[];
}

export interface SpeechPlaybackDependencies {
	getSynthesis(): SpeechSynthesisLike | null;
	createUtterance(text: string): SpeechSynthesisUtterance;
}

function defaultDependencies(): SpeechPlaybackDependencies {
	return {
		getSynthesis: () =>
			typeof window !== 'undefined' && 'speechSynthesis' in window
				? window.speechSynthesis
				: null,
		createUtterance: (text) => new SpeechSynthesisUtterance(text)
	};
}

export function speechRateForWpm(wpm: number): number {
	return Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, wpm / BASELINE_WPM));
}

export function clampTtsWpm(wpm: number): number {
	return Math.min(MAX_TTS_WPM, wpm);
}

function spokenText(state: ReaderState): string {
	const chunkText = state.chunk
		.map((word) => word.raw || `${word.word}${word.punctuation}`)
		.join(' ')
		.trim();
	return chunkText || state.displayToken?.text?.trim() || '';
}

function stateKey(state: ReaderState): string {
	return [
		state.playbackSource ?? 'legacy',
		state.playbackMode,
		state.currentSectionIndex ?? -1,
		state.currentTokenIndex ?? -1,
		state.currentIndex,
		state.currentWpm,
		state.speechSequence ?? -1,
		spokenText(state)
	].join('|');
}

export class SpeechPlaybackController {
	private activeKey: string | null = null;
	private synthesis: SpeechSynthesisLike | null = null;
	private pendingUtterances = 0;

	constructor(private readonly deps: SpeechPlaybackDependencies = defaultDependencies()) {}

	sync(state: ReaderState | null, enabled: boolean, voiceUri = ''): void {
		if (!enabled || !state?.isPlaying || state.finished) {
			this.cancel();
			return;
		}

		const text = spokenText(state);
		if (!text) {
			this.cancel();
			return;
		}

		const key = stateKey(state);
		if (key === this.activeKey) {
			return;
		}

		const synthesis = this.deps.getSynthesis();
		if (!synthesis) {
			this.activeKey = null;
			return;
		}

		// Do not cancel the word currently being spoken. The browser speech
		// engine owns this asynchronous queue and processes it off the UI path.
		// A small bound prevents an unsupported/slow voice from building an
		// unbounded backlog while visual playback continues.
		if (this.pendingUtterances >= MAX_BUFFERED_UTTERANCES) {
			this.activeKey = key;
			return;
		}

		const utterance = this.deps.createUtterance(text);
		utterance.rate = speechRateForWpm(state.currentWpm);
		if (voiceUri) {
			utterance.voice =
				synthesis.getVoices?.().find((voice) => voice.voiceURI === voiceUri) ?? null;
		}
		let settled = false;
		const settle = () => {
			if (settled) {
				return;
			}
			settled = true;
			this.pendingUtterances = Math.max(0, this.pendingUtterances - 1);
		};
		utterance.onend = settle;
		utterance.onerror = settle;
		this.synthesis = synthesis;
		this.activeKey = key;
		this.pendingUtterances += 1;
		try {
			synthesis.speak(utterance);
		} catch {
			settle();
		}
	}

	cancel(): void {
		this.synthesis?.cancel();
		this.synthesis = null;
		this.activeKey = null;
		this.pendingUtterances = 0;
	}

	destroy(): void {
		this.cancel();
	}
}
