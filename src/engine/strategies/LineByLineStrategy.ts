import type { WordData } from '../../types';
import type { RSVPEngineContext } from '../playbackStrategy';
import { BasePlaybackStrategy } from './BasePlaybackStrategy';
import { tokensToDisplayChunk } from '../manifestPlayback';
import {
	getLegacyLineChunk,
	getManifestLineChunk,
	sumLegacyLineDelayMs,
	sumManifestLineDelayMs,
	applyLineByLineRewindBuffer,
	findChunkIndex,
	getLegacyUnitWordSeekIndices,
	getManifestUnitWordSeekIndices,
	getLineChunkStartsForUnit
} from '../lineByLinePlayback';
import {
	computeLineByLineAdvance,
	findSentenceUnitForSeekIndex,
	nextLineUnitIndex,
	prevLineUnitIndex
} from '../lineRepeatPlayback';
import {
	navWordsFromLegacy,
	navWordsFromStream,
	wordIndexForSeekIndex
} from '../readingNavigation';

export class LineByLineStrategy extends BasePlaybackStrategy {
	private rewindBufferActive = false;

	play(ctx: RSVPEngineContext): void {
		if (ctx.playbackSource === 'manifest') {
			this.runManifestLoop(ctx);
		} else {
			this.runLegacyLoop(ctx);
		}
	}

	nextLine(ctx: RSVPEngineContext): void {
		const units = ctx.sentenceUnits;
		if (units.length === 0) return;

		const seekIndex = ctx.playbackSource === 'manifest' ? ctx.currentTokenIndex : ctx.currentIndex;
		const unitIndex = findSentenceUnitForSeekIndex(units, seekIndex);
		const unit = units[unitIndex]!;
		const wordSeekIndices =
			ctx.playbackSource === 'manifest'
				? getManifestUnitWordSeekIndices(ctx.getActiveStream(), unit)
				: getLegacyUnitWordSeekIndices(unit);
		const chunkStarts = getLineChunkStartsForUnit(unit, ctx.settings.reader.chunkSize, wordSeekIndices);
		const chunkIndex = findChunkIndex(chunkStarts, seekIndex);

		if (chunkIndex + 1 < chunkStarts.length) {
			this.setSeekIndex(ctx, chunkStarts[chunkIndex + 1]!);
		} else {
			const nextIndex = nextLineUnitIndex(units, unitIndex);
			if (nextIndex === unitIndex && unitIndex >= units.length - 1) {
				this.pause(ctx);
				ctx.emitState(true);
				ctx.onComplete();
				return;
			}
			this.setSeekIndex(ctx, units[nextIndex]!.startSeekIndex);
		}
	}

	prevLine(ctx: RSVPEngineContext): void {
		const units = ctx.sentenceUnits;
		if (units.length === 0) return;

		const seekIndex = ctx.playbackSource === 'manifest' ? ctx.currentTokenIndex : ctx.currentIndex;
		const unitIndex = findSentenceUnitForSeekIndex(units, seekIndex);
		const unit = units[unitIndex]!;
		const wordSeekIndices =
			ctx.playbackSource === 'manifest'
				? getManifestUnitWordSeekIndices(ctx.getActiveStream(), unit)
				: getLegacyUnitWordSeekIndices(unit);
		const chunkStarts = getLineChunkStartsForUnit(unit, ctx.settings.reader.chunkSize, wordSeekIndices);
		const chunkIndex = findChunkIndex(chunkStarts, seekIndex);

		this.rewindBufferActive = true;

		if (chunkIndex > 0) {
			this.setSeekIndex(ctx, chunkStarts[chunkIndex - 1]!);
		} else {
			const prevIndex = prevLineUnitIndex(units, unitIndex);
			if (prevIndex !== unitIndex) {
				const prevUnit = units[prevIndex]!;
				const prevWordSeekIndices =
					ctx.playbackSource === 'manifest'
						? getManifestUnitWordSeekIndices(ctx.getActiveStream(), prevUnit)
						: getLegacyUnitWordSeekIndices(prevUnit);
				const prevChunkStarts = getLineChunkStartsForUnit(
					prevUnit,
					ctx.settings.reader.chunkSize,
					prevWordSeekIndices
				);
				this.setSeekIndex(ctx, prevChunkStarts[prevChunkStarts.length - 1]!);
			} else {
				this.setSeekIndex(ctx, unit.startSeekIndex);
			}
		}
	}

	private setSeekIndex(ctx: RSVPEngineContext, seekIndex: number) {
		if (ctx.playbackSource === 'manifest') {
			ctx.seekToToken(seekIndex);
		} else {
			ctx.seekToIndex(seekIndex);
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

		const { endIndex, lineStartIndex } = getLegacyLineChunk(
			ctx.words,
			ctx.sentenceUnits,
			ctx.currentIndex,
			ctx.settings.reader.chunkSize
		);
		if (ctx.currentIndex !== lineStartIndex) {
			ctx.setCurrentIndex(lineStartIndex);
		}

		ctx.emitState(false);
		const delay = this.getCurrentDelay(ctx);

		ctx.setTimeoutId(
			window.setTimeout(() => {
				ctx.setTimeoutId(null);
				const result = computeLineByLineAdvance(
					ctx.sentenceUnits,
					ctx.currentIndex,
					endIndex,
					false
				);

				if (result.action === 'complete') {
					ctx.setIsPlaying(false);
					ctx.emitState(true);
					ctx.onComplete();
					return;
				}

				ctx.setCurrentIndex(result.nextSeekIndex);
				this.runLegacyLoop(ctx);
			}, delay)
		);
	}

	private runManifestLoop(ctx: RSVPEngineContext) {
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

		const { tokens, endIndex, lineStartIndex } = getManifestLineChunk(
			stream,
			ctx.sentenceUnits,
			ctx.currentTokenIndex,
			ctx.settings.reader.chunkSize
		);
		if (ctx.currentTokenIndex !== lineStartIndex) {
			ctx.setCurrentTokenIndex(lineStartIndex);
		}

		ctx.emitState(false);
		const delay = this.getCurrentDelay(ctx);

		ctx.setTimeoutId(
			window.setTimeout(() => {
				ctx.setTimeoutId(null);
				const result = computeLineByLineAdvance(
					ctx.sentenceUnits,
					ctx.currentTokenIndex,
					endIndex,
					true,
					stream.length
				);

				if (result.action === 'complete') {
					ctx.setIsPlaying(false);
					ctx.emitState(true);
					ctx.onComplete();
					return;
				}

				ctx.setCurrentTokenIndex(result.nextSeekIndex);
				this.runManifestLoop(ctx);
			}, delay)
		);
	}

	getCurrentChunk(ctx: RSVPEngineContext): WordData[] {
		if (ctx.playbackSource === 'manifest') {
			const stream = ctx.getActiveStream();
			if (ctx.currentTokenIndex >= stream.length) return [];
			const { tokens } = getManifestLineChunk(
				stream,
				ctx.sentenceUnits,
				ctx.currentTokenIndex,
				ctx.settings.reader.chunkSize
			);
			return tokensToDisplayChunk(tokens);
		}

		if (ctx.currentIndex >= ctx.words.length) return [];
		const { words } = getLegacyLineChunk(
			ctx.words,
			ctx.sentenceUnits,
			ctx.currentIndex,
			ctx.settings.reader.chunkSize
		);
		return words;
	}

	getChunkSeekIndices(ctx: RSVPEngineContext): number[] {
		const seekIndex = ctx.playbackSource === 'manifest' ? ctx.currentTokenIndex : ctx.currentIndex;

		if (ctx.playbackSource === 'manifest') {
			const stream = ctx.getActiveStream();
			const { endIndex, lineStartIndex } = getManifestLineChunk(
				stream,
				ctx.sentenceUnits,
				seekIndex,
				ctx.settings.reader.chunkSize
			);
			const indices: number[] = [];
			for (let i = lineStartIndex; i < endIndex; i++) {
				const token = stream[i];
				if (token?.kind === 'word') indices.push(i);
				else if (indices.length === 0 && token) indices.push(i);
			}
			return indices.length > 0 ? indices : [Math.min(seekIndex, Math.max(stream.length - 1, 0))];
		}

		const { endIndex, lineStartIndex } = getLegacyLineChunk(
			ctx.words,
			ctx.sentenceUnits,
			seekIndex,
			ctx.settings.reader.chunkSize
		);
		const indices: number[] = [];
		for (let i = lineStartIndex; i < endIndex; i++) indices.push(i);
		return indices.length > 0 ? indices : [Math.min(seekIndex, Math.max(ctx.words.length - 1, 0))];
	}

	getCurrentDelay(ctx: RSVPEngineContext): number {
		let delay = 0;
		if (ctx.playbackSource === 'manifest') {
			const { tokens } = getManifestLineChunk(
				ctx.getActiveStream(),
				ctx.sentenceUnits,
				ctx.currentTokenIndex,
				ctx.settings.reader.chunkSize
			);
			delay = sumManifestLineDelayMs(tokens, ctx.settings, ctx.micropauseService);
		} else {
			const { words } = getLegacyLineChunk(
				ctx.words,
				ctx.sentenceUnits,
				ctx.currentIndex,
				ctx.settings.reader.chunkSize
			);
			delay = sumLegacyLineDelayMs(words, ctx.settings, ctx.micropauseService);
		}

		const buffered = applyLineByLineRewindBuffer(delay, this.rewindBufferActive);
		this.rewindBufferActive = false;
		return buffered;
	}

	calculateRemainingMs(ctx: RSVPEngineContext): number {
		if (ctx.sentenceUnits.length === 0) return 0;

		const seekIndex = ctx.playbackSource === 'manifest' ? ctx.currentTokenIndex : ctx.currentIndex;
		const unitIndex = findSentenceUnitForSeekIndex(ctx.sentenceUnits, seekIndex);
		let total = 0;

		if (ctx.playbackSource === 'manifest') {
			const stream = ctx.getActiveStream();
			for (let i = unitIndex; i < ctx.sentenceUnits.length; i++) {
				const unit = ctx.sentenceUnits[i]!;
				const wordSeekIndices = getManifestUnitWordSeekIndices(stream, unit);
				const chunkStarts = getLineChunkStartsForUnit(
					unit,
					ctx.settings.reader.chunkSize,
					wordSeekIndices
				);

				for (const start of chunkStarts) {
					if (i === unitIndex && start < seekIndex) continue;
					const { tokens } = getManifestLineChunk(
						stream,
						ctx.sentenceUnits,
						start,
						ctx.settings.reader.chunkSize
					);
					total += sumManifestLineDelayMs(tokens, ctx.settings, ctx.micropauseService);
				}
			}
		} else {
			for (let i = unitIndex; i < ctx.sentenceUnits.length; i++) {
				const unit = ctx.sentenceUnits[i]!;
				const wordSeekIndices = getLegacyUnitWordSeekIndices(unit);
				const chunkStarts = getLineChunkStartsForUnit(
					unit,
					ctx.settings.reader.chunkSize,
					wordSeekIndices
				);

				for (const start of chunkStarts) {
					if (i === unitIndex && start < seekIndex) continue;
					const { words } = getLegacyLineChunk(
						ctx.words,
						ctx.sentenceUnits,
						start,
						ctx.settings.reader.chunkSize
					);
					total += sumLegacyLineDelayMs(words, ctx.settings, ctx.micropauseService);
				}
			}
		}

		return total;
	}

	getCurrentChunkWordIndices(ctx: RSVPEngineContext, _totalNavWords: number): number[] {
		const navWords =
			ctx.playbackSource === 'manifest'
				? navWordsFromStream(ctx.getActiveStream())
				: navWordsFromLegacy(ctx.words);
		const seekIndices = this.getChunkSeekIndices(ctx);
		const indices = seekIndices.map((seekIdx) => wordIndexForSeekIndex(navWords, seekIdx));

		if (indices.length > 0) {
			return indices;
		}

		const fallbackSeek =
			ctx.playbackSource === 'manifest' ? ctx.currentTokenIndex : ctx.currentIndex;
		return [wordIndexForSeekIndex(navWords, fallbackSeek)];
	}
}
