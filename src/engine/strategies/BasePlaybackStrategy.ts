import type { WordData } from '../../types';
import type { StreamTokenKind } from '../../types/processedDocument';
import type { PlaybackStrategy, RSVPEngineContext } from '../playbackStrategy';

export abstract class BasePlaybackStrategy implements PlaybackStrategy {
	abstract play(ctx: RSVPEngineContext): void;

	pause(ctx: RSVPEngineContext): void {
		if (ctx.timeoutId !== null) {
			window.clearTimeout(ctx.timeoutId);
			ctx.setTimeoutId(null);
		}
		ctx.setIsPlaying(false);
		ctx.emitState(false);
	}

	nextLine(ctx: RSVPEngineContext): void {
		// Default: no-op or handled via smart forward in engine
	}

	prevLine(ctx: RSVPEngineContext): void {
		// Default: no-op or handled via smart rewind in engine
	}

	abstract getCurrentChunk(ctx: RSVPEngineContext): WordData[];
	abstract getChunkSeekIndices(ctx: RSVPEngineContext): number[];
	abstract getCurrentDelay(ctx: RSVPEngineContext): number;
	abstract calculateRemainingMs(ctx: RSVPEngineContext): number;
	abstract getCurrentChunkWordIndices(ctx: RSVPEngineContext, totalNavWords: number): number[];

	getPrimaryDisplayToken(ctx: RSVPEngineContext): { kind: StreamTokenKind; text?: string; orpIndex?: number; alt?: string } | undefined {
		return undefined;
	}

	protected crossesParagraphBoundary(ctx: RSVPEngineContext, chunk: WordData[]): boolean {
		for (let i = 0; i < chunk.length - 1; i++) {
			const current = chunk[i];
			const next = chunk[i + 1];
			if (current && next) {
				const gap = next.start - current.end;
				if (gap >= 2) {
					return true;
				}
			}
		}

		const lastChunkWord = chunk[chunk.length - 1];
		const nextWord = ctx.words[ctx.currentIndex + chunk.length];
		if (lastChunkWord && nextWord) {
			const gap = nextWord.start - lastChunkWord.end;
			return gap >= 2;
		}

		return false;
	}

	protected startsAtHeading(ctx: RSVPEngineContext, index: number): boolean {
		return ctx.headings.some((heading) => heading.wordIndex === index);
	}
}
