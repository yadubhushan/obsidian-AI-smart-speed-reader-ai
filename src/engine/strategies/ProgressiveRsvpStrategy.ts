import type { WordData } from '../../types';
import type { StreamToken, StreamTokenKind } from '../../types/processedDocument';
import type { RSVPEngineContext } from '../playbackStrategy';
import { RsvpStrategy } from './RsvpStrategy';
import {
	getProgressiveLegacyChunk,
	getProgressiveWordTokensChunk,
	progressivePrimaryDisplayToken,
	progressiveTokensToDisplayChunk,
	progressiveWordsToDisplayChunk
} from '../progressiveRsvp';
import { navWordsFromStream, wordIndicesForLegacyChunk, wordIndicesForManifestChunk } from '../readingNavigation';

export class ProgressiveRsvpStrategy extends RsvpStrategy {
	getCurrentChunk(ctx: RSVPEngineContext): WordData[] {
		if (ctx.playbackSource === 'manifest') {
			const stream = ctx.getPlaybackStream();
			if (ctx.currentTokenIndex >= stream.length) {
				return [];
			}
			const { tokens } = this.resolveManifestChunk(ctx, ctx.currentTokenIndex);
			return progressiveTokensToDisplayChunk(tokens);
		}

		if (ctx.currentIndex >= ctx.words.length) {
			return [];
		}

		const { words } = this.resolveLegacyChunk(ctx, ctx.currentIndex);
		return progressiveWordsToDisplayChunk(words);
	}

	getCurrentChunkWordIndices(ctx: RSVPEngineContext, totalNavWords: number): number[] {
		if (ctx.playbackSource === 'manifest') {
			const playbackStream = ctx.getPlaybackStream();
			const baseStream = ctx.getActiveStream();
			const { endIndex } = getProgressiveWordTokensChunk(
				playbackStream,
				ctx.currentTokenIndex,
				ctx.settings.reader.progressiveRsvpMaxWordLength
			);
			return wordIndicesForManifestChunk(
				navWordsFromStream(baseStream),
				ctx.getBaseTokenIndex(),
				Math.max(endIndex - ctx.currentTokenIndex, 1),
				baseStream.length
			);
		}

		const { endIndex } = getProgressiveLegacyChunk(
			ctx.words,
			ctx.currentIndex,
			ctx.settings.reader.progressiveRsvpMaxWordLength
		);
		return wordIndicesForLegacyChunk(ctx.currentIndex, endIndex - ctx.currentIndex, ctx.words.length);
	}

	getPrimaryDisplayToken(ctx: RSVPEngineContext): { kind: StreamTokenKind; text?: string; orpIndex?: number; alt?: string } | undefined {
		if (ctx.playbackSource !== 'manifest') return undefined;
		const { tokens } = this.resolveManifestChunk(ctx, ctx.currentTokenIndex);
		return progressivePrimaryDisplayToken(tokens);
	}

	protected resolveLegacyChunk(ctx: RSVPEngineContext, startIndex: number): { words: WordData[]; endIndex: number } {
		return getProgressiveLegacyChunk(
			ctx.words,
			startIndex,
			ctx.settings.reader.progressiveRsvpMaxWordLength
		);
	}

	protected resolveManifestChunk(ctx: RSVPEngineContext, startIndex: number): { tokens: StreamToken[]; endIndex: number } {
		const stream = ctx.getPlaybackStream();
		return getProgressiveWordTokensChunk(
			stream,
			startIndex,
			ctx.settings.reader.progressiveRsvpMaxWordLength
		);
	}
}
