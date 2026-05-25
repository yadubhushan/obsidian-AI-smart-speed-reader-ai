import type { RSVPEngineContext } from '../playbackStrategy';
import { RsvpStrategy } from './RsvpStrategy';
import { getDelayForTokens } from '../manifestPlayback';
import {
	computeLineRepeatAdvance,
	findSentenceUnitForSeekIndex,
	nextLineUnitIndex,
	prevLineUnitIndex
} from '../lineRepeatPlayback';
import { wordIndicesForLegacyChunk, wordIndicesForManifestChunk } from '../readingNavigation';

export class LineRepeatStrategy extends RsvpStrategy {
	play(ctx: RSVPEngineContext): void {
		if (ctx.playbackSource === 'manifest') {
			this.runLineRepeatManifestLoop(ctx);
		} else {
			this.runLineRepeatLegacyLoop(ctx);
		}
	}

	nextLine(ctx: RSVPEngineContext): void {
		const units = ctx.sentenceUnits;
		if (units.length === 0) return;

		const seekIndex = ctx.playbackSource === 'manifest' ? ctx.currentTokenIndex : ctx.currentIndex;
		const unitIndex = findSentenceUnitForSeekIndex(units, seekIndex);
		const nextIndex = nextLineUnitIndex(units, unitIndex);

		if (nextIndex === unitIndex && unitIndex >= units.length - 1) {
			this.pause(ctx);
			ctx.emitState(true);
			ctx.onComplete();
			return;
		}

		if (ctx.playbackSource === 'manifest') {
			ctx.seekToToken(units[nextIndex]!.startSeekIndex);
		} else {
			ctx.seekToIndex(units[nextIndex]!.startSeekIndex);
		}
	}

	prevLine(ctx: RSVPEngineContext): void {
		const units = ctx.sentenceUnits;
		if (units.length === 0) return;

		const seekIndex = ctx.playbackSource === 'manifest' ? ctx.currentTokenIndex : ctx.currentIndex;
		const unitIndex = findSentenceUnitForSeekIndex(units, seekIndex);
		const prevIndex = prevLineUnitIndex(units, unitIndex);

		if (ctx.playbackSource === 'manifest') {
			ctx.seekToToken(units[prevIndex]!.startSeekIndex);
		} else {
			ctx.seekToIndex(units[prevIndex]!.startSeekIndex);
		}
	}

	private runLineRepeatLegacyLoop(ctx: RSVPEngineContext) {
		if (!ctx.isPlaying) return;

		if (ctx.currentIndex >= ctx.words.length) {
			ctx.setIsPlaying(false);
			ctx.emitState(true);
			ctx.onComplete();
			return;
		}

		ctx.emitState(false);
		const delay = this.getCurrentDelay(ctx);
		const nextIndex = ctx.currentIndex + ctx.settings.reader.chunkSize;

		ctx.setTimeoutId(
			window.setTimeout(() => {
				ctx.setTimeoutId(null);
				const result = computeLineRepeatAdvance(
					ctx.sentenceUnits,
					ctx.currentIndex,
					nextIndex,
					ctx.settings.reader.lineRepeatGapMs,
					false
				);

				if (result.action === 'complete') {
					ctx.setIsPlaying(false);
					ctx.emitState(true);
					ctx.onComplete();
					return;
				}

				if (result.action === 'loop') {
					ctx.setCurrentIndex(result.nextSeekIndex);
					ctx.setTimeoutId(
						window.setTimeout(() => {
							ctx.setTimeoutId(null);
							this.runLineRepeatLegacyLoop(ctx);
						}, result.extraDelayMs)
					);
					return;
				}

				ctx.setCurrentIndex(result.nextSeekIndex);
				this.runLineRepeatLegacyLoop(ctx);
			}, delay)
		);
	}

	private runLineRepeatManifestLoop(ctx: RSVPEngineContext) {
		if (!ctx.isPlaying) return;

		const stream = ctx.getActiveStream();

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

		const { tokens, endIndex } = this.resolveManifestChunk(ctx, ctx.currentTokenIndex);
		const delay = getDelayForTokens(tokens, ctx.settings, ctx.micropauseService);

		ctx.setTimeoutId(
			window.setTimeout(() => {
				ctx.setTimeoutId(null);
				const result = computeLineRepeatAdvance(
					ctx.sentenceUnits,
					ctx.currentTokenIndex,
					endIndex,
					ctx.settings.reader.lineRepeatGapMs,
					true,
					stream.length
				);

				if (result.action === 'complete') {
					ctx.setIsPlaying(false);
					ctx.emitState(true);
					ctx.onComplete();
					return;
				}

				if (result.action === 'loop') {
					ctx.setCurrentTokenIndex(result.nextSeekIndex);
					ctx.setTimeoutId(
						window.setTimeout(() => {
							ctx.setTimeoutId(null);
							this.runLineRepeatManifestLoop(ctx);
						}, result.extraDelayMs)
					);
					return;
				}

				ctx.setCurrentTokenIndex(result.nextSeekIndex);
				this.runLineRepeatManifestLoop(ctx);
			}, delay)
		);
	}
}
