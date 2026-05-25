import type { SpeedReaderAiSettings, WordData, HeadingInfo } from '../types';
import type { ProcessedDocument, StreamToken, StreamTokenKind } from '../types/processedDocument';
import type { SentenceUnit } from './lineRepeatPlayback';
import type { MicropauseService } from '../services/micropauseService';
import type { PlaybackMode } from '../types';

export interface RSVPEngineContext {
	// State
	words: WordData[];
	headings: HeadingInfo[];
	currentIndex: number;
	currentTokenIndex: number;
	currentSectionIndex: number;
	processed: ProcessedDocument | null;
	sentenceUnits: SentenceUnit[];
	settings: SpeedReaderAiSettings;
	micropauseService: MicropauseService;
	isPlaying: boolean;
	timeoutId: number | null;
	playbackSource: 'legacy' | 'manifest';
	playbackMode: PlaybackMode;

	// Mutations
	setCurrentIndex(index: number): void;
	setCurrentTokenIndex(index: number): void;
	setIsPlaying(playing: boolean): void;
	setTimeoutId(id: number | null): void;

	seekToIndex(index: number): void;
	seekToToken(index: number): void;

	// Actions
	emitState(finished: boolean): void;
	onComplete(): void;
	onSectionComplete?(): void;
	getActiveStream(): StreamToken[];
}

export interface PlaybackStrategy {
	play(ctx: RSVPEngineContext): void;
	pause(ctx: RSVPEngineContext): void;
	nextLine(ctx: RSVPEngineContext): void;
	prevLine(ctx: RSVPEngineContext): void;

	getCurrentChunk(ctx: RSVPEngineContext): WordData[];
	getChunkSeekIndices(ctx: RSVPEngineContext): number[];
	getCurrentDelay(ctx: RSVPEngineContext): number;
	calculateRemainingMs(ctx: RSVPEngineContext): number;
	getCurrentChunkWordIndices(ctx: RSVPEngineContext, totalNavWords: number): number[];
	getPrimaryDisplayToken(ctx: RSVPEngineContext): { kind: StreamTokenKind; text?: string; orpIndex?: number; alt?: string } | undefined;
}
