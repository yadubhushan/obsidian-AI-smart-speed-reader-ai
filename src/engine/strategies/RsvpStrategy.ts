import type { WordData } from '../../types';
import type { StreamToken } from '../../types/processedDocument';
import type { RSVPEngineContext } from '../playbackStrategy';
import { BasePlaybackStrategy } from './BasePlaybackStrategy';
import { getWordTokensChunk, getDelayForTokens, tokensToDisplayChunk, primaryDisplayToken } from '../manifestPlayback';
import type { StreamTokenKind } from '../../types/processedDocument';
import { navWordsFromStream, wordIndicesForLegacyChunk, wordIndicesForManifestChunk } from '../readingNavigation';

export class RsvpStrategy extends BasePlaybackStrategy {
	play(ctx: RSVPEngineContext): void {
		if (ctx.playbackSource === 'manifest') {
			this.runManifestLoop(ctx);
		} else {
			this.runLegacyLoop(ctx);
		}
	}

	private runLegacyLoop(ctx: RSVPEngineContext) {
		if (!ctx.isPlaying) return;

		if (ctx.currentIndex >= ctx.words.length) {
			ctx.setIsPlaying(false);
			ctx.emitState(true);
			ctx.onComplete();
			return;
		}

		ctx.emitState(false);
		const delay = this.getCurrentDelay(ctx);
		const { endIndex } = this.resolveLegacyChunk(ctx, ctx.currentIndex);

		ctx.setTimeoutId(
			window.setTimeout(() => {
				ctx.setCurrentIndex(endIndex);
				ctx.setTimeoutId(null);
				this.runLegacyLoop(ctx);
			}, delay)
		);
	}

	private runManifestLoop(ctx: RSVPEngineContext) {
		if (!ctx.isPlaying) return;

		const stream = ctx.getPlaybackStream();

		if (ctx.currentTokenIndex >= stream.length) {
			if (ctx.processed && ctx.processed.kind === 'sections') {
				if (ctx.currentSectionIndex < ctx.processed.sections.length - 1) {
					ctx.setIsPlaying(false);
					ctx.emitState(false);
					ctx.onSectionComplete?.();
					return;
				}
			}

			ctx.setIsPlaying(false);
			ctx.emitState(true);
			ctx.onComplete();
			return;
		}

		ctx.emitState(false);

		const { endIndex } = this.resolveManifestChunk(ctx, ctx.currentTokenIndex);
		const delay = this.getCurrentDelay(ctx);

		ctx.setTimeoutId(
			window.setTimeout(() => {
				ctx.setCurrentTokenIndex(endIndex);
				ctx.setTimeoutId(null);
				this.runManifestLoop(ctx);
			}, delay)
		);
	}

	getCurrentChunk(ctx: RSVPEngineContext): WordData[] {
		if (ctx.playbackSource === 'manifest') {
			const stream = ctx.getPlaybackStream();
			if (ctx.currentTokenIndex >= stream.length) {
				return [];
			}
			const { tokens } = this.resolveManifestChunk(ctx, ctx.currentTokenIndex);
			return tokensToDisplayChunk(tokens);
		}

		if (ctx.currentIndex >= ctx.words.length) {
			return [];
		}

		const { words } = this.resolveLegacyChunk(ctx, ctx.currentIndex);
		return words;
	}

	getChunkSeekIndices(ctx: RSVPEngineContext): number[] {
		if (ctx.playbackSource === 'manifest') {
			const stream = ctx.getPlaybackStream();
			const { tokens, endIndex } = this.resolveManifestChunk(ctx, ctx.currentTokenIndex);
			if (tokens.length === 0 && stream.length > 0) {
				return [Math.min(ctx.currentTokenIndex, stream.length - 1)];
			}

			const indices: number[] = [];
			for (let i = ctx.currentTokenIndex; i < endIndex; i++) {
				const token = stream[i];
				if (token?.kind === 'word') {
					indices.push(i);
				} else if (indices.length === 0) {
					indices.push(i);
				}
			}

			return indices.length > 0 ? indices : [Math.min(ctx.currentTokenIndex, stream.length - 1)];
		}

		const { endIndex } = this.resolveLegacyChunk(ctx, ctx.currentIndex);
		const indices: number[] = [];
		for (let i = ctx.currentIndex; i < endIndex; i++) {
			indices.push(i);
		}
		return indices.length > 0 ? indices : [Math.min(ctx.currentIndex, Math.max(ctx.words.length - 1, 0))];
	}

	getCurrentDelay(ctx: RSVPEngineContext): number {
		const chunk = this.getCurrentChunk(ctx);
		if (chunk.length === 0) {
			return 0;
		}

		const baseDelay = 60000 / ctx.settings.reader.wpm;
		let multiplier = 1;

		for (const word of chunk) {
			multiplier = Math.max(multiplier, ctx.micropauseService.getWordMultiplier(word));
		}

		if (ctx.settings.reader.enableMicropause && this.crossesParagraphBoundary(ctx, chunk)) {
			multiplier = Math.max(multiplier, 1 + (2.2 - 1) * ctx.settings.reader.micropauseIntensity);
		}

		if (ctx.settings.reader.enableMicropause && this.startsAtHeading(ctx, ctx.currentIndex)) {
			multiplier = Math.max(multiplier, 1 + (1.8 - 1) * ctx.settings.reader.micropauseIntensity);
		}

		return baseDelay * multiplier;
	}

	calculateRemainingMs(ctx: RSVPEngineContext): number {
		if (ctx.playbackSource === 'manifest') {
			const stream = ctx.getPlaybackStream();
			let total = 0;
			for (let i = ctx.currentTokenIndex; i < stream.length; ) {
				const { tokens, endIndex } = this.resolveManifestChunk(ctx, i);
				if (tokens.length === 0) {
					break;
				}
				total += getDelayForTokens(tokens, ctx.settings, ctx.micropauseService);
				i = endIndex;
			}
			return total;
		}

		if (ctx.currentIndex >= ctx.words.length) {
			return 0;
		}

		const baseDelay = 60000 / ctx.settings.reader.wpm;
		let total = 0;

		for (let index = ctx.currentIndex; index < ctx.words.length; ) {
			const { words: chunk, endIndex } = this.resolveLegacyChunk(ctx, index);
			if (chunk.length === 0) {
				break;
			}
			let multiplier = 1;
			for (const word of chunk) {
				multiplier = Math.max(multiplier, ctx.micropauseService.getWordMultiplier(word));
			}

			total += baseDelay * multiplier;
			index = endIndex;
		}

		return total;
	}

	getCurrentChunkWordIndices(ctx: RSVPEngineContext, _totalNavWords: number): number[] {
		if (ctx.playbackSource === 'manifest') {
			const stream = ctx.getActiveStream();
			return wordIndicesForManifestChunk(
				navWordsFromStream(stream),
				ctx.getBaseTokenIndex(),
				this.getEffectiveChunkSize(ctx),
				stream.length
			);
		}
		return wordIndicesForLegacyChunk(ctx.currentIndex, this.getEffectiveChunkSize(ctx), ctx.words.length);
	}

	getPrimaryDisplayToken(ctx: RSVPEngineContext): { kind: StreamTokenKind; text?: string; orpIndex?: number; alt?: string } | undefined {
		if (ctx.playbackSource !== 'manifest') return undefined;
		const { tokens } = this.resolveManifestChunk(ctx, ctx.currentTokenIndex);
		return primaryDisplayToken(tokens);
	}

	protected getEffectiveChunkSize(ctx: RSVPEngineContext): number {
		return ctx.settings.reader.chunkSize;
	}

	protected resolveLegacyChunk(ctx: RSVPEngineContext, startIndex: number): { words: WordData[]; endIndex: number } {
		const endIndex = Math.min(startIndex + this.getEffectiveChunkSize(ctx), ctx.words.length);
		return {
			words: ctx.words.slice(startIndex, endIndex),
			endIndex
		};
	}

	protected resolveManifestChunk(ctx: RSVPEngineContext, startIndex: number): { tokens: StreamToken[]; endIndex: number } {
		const stream = ctx.getPlaybackStream();
		return getWordTokensChunk(stream, startIndex, this.getEffectiveChunkSize(ctx));
	}
}
