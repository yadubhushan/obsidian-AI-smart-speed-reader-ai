import {
	HeadingInfo,
	PlaybackMode,
	ReaderState,
	SpeedReaderAiSettings,
	WordData
} from '../types';
import type { NormalizedDocumentBundle } from '../parse/normalizeTypes';
import type { ParsedSegments } from '../parse/segmentTypes';
import {
	bundleToSectionsProcessed,
	bundleToStoryProcessed,
	findStoryTokenIndexForOffset
} from '../prepare/deterministicPlayback';
import { getDocumentProcessor } from '../prepare/documentProcessorRegistry';
import type {
	ProcessedDocument,
	ProcessedSection,
	ProcessingModeId,
	ReaderUxProfile,
	StreamToken
} from '../types/processedDocument';
import { MicropauseService } from '../services/micropauseService';
import { parseDocument } from '../services/textParser';
import {
	clamp,
	findHeadingTokenIndex,
	getDelayForTokens,
	getWordTokensChunk,
	listStreamHeadings,
	primaryDisplayToken,
	tokensToDisplayChunk
} from './manifestPlayback';
import {
	buildSentenceUnits,
	computeLineRepeatAdvance,
	findSentenceUnitForSeekIndex,
	getLineBoundary,
	nextLineUnitIndex,
	prevLineUnitIndex,
	SentenceUnit
} from './lineRepeatPlayback';
import {
	buildPauseContext,
	computeSmartForwardTarget,
	computeSmartRewindTarget,
	navWordsFromLegacy,
	navWordsFromStream,
	PAUSE_CONTEXT_RADIUS,
	PauseContextToken,
	SMART_NAV_CHUNK_SIZE,
	wordIndexForSeekIndex,
	wordIndicesForLegacyChunk,
	wordIndicesForManifestChunk
} from './readingNavigation';

export type { PauseContextToken } from './readingNavigation';

export interface LoadProcessedDocumentOptions {
	sectionIndex?: number;
	tokenIndex?: number;
	isDeterministic?: boolean;
}

export interface LoadDeterministicOptions extends LoadProcessedDocumentOptions {
	parsed?: ParsedSegments;
	editorOffset?: number;
}

function isSectionsProcessed(
	processed: ProcessedDocument
): processed is Extract<ProcessedDocument, { kind: 'sections' }> {
	return processed.kind === 'sections';
}

function isStoryProcessed(
	processed: ProcessedDocument
): processed is Extract<ProcessedDocument, { kind: 'single_story' }> {
	return processed.kind === 'single_story';
}

export class RSVPEngine {
	private words: WordData[] = [];
	private headings: HeadingInfo[] = [];
	private currentIndex = 0;
	private isPlaying = false;
	private timeoutId: number | null = null;
	private settings: SpeedReaderAiSettings;
	private onStateChange: (state: ReaderState) => void;
	private onComplete: () => void;
	private onSectionComplete?: () => void;

	private playbackSource: 'legacy' | 'manifest' = 'legacy';
	private processed: ProcessedDocument | null = null;
	private uxProfile: ReaderUxProfile | null = null;
	private isDeterministic = false;
	private currentSectionIndex = 0;
	private currentTokenIndex = 0;
	private playbackMode: PlaybackMode;
	private sentenceUnits: SentenceUnit[] = [];

	constructor(
		settings: SpeedReaderAiSettings,
		onStateChange: (state: ReaderState) => void,
		onComplete: () => void,
		onSectionComplete?: () => void
	) {
		this.settings = settings;
		this.playbackMode = settings.reader.defaultPlaybackMode;
		this.onStateChange = onStateChange;
		this.onComplete = onComplete;
		this.onSectionComplete = onSectionComplete;
		this.micropauseService = new MicropauseService(settings);
	}

	private micropauseService: MicropauseService;

	loadText(text: string, startOffset = 0) {
		this.clearManifestState();
		this.playbackSource = 'legacy';
		const parsed = parseDocument(text, startOffset);
		this.words = parsed.words;
		this.headings = parsed.headings;
		this.currentIndex = clamp(parsed.startWordIndex, 0, Math.max(this.words.length - 1, 0));
		this.rebuildSentenceUnits();
		this.emitState(false);
	}

	loadProcessedDocument(
		processed: ProcessedDocument,
		opts: LoadProcessedDocumentOptions = {}
	) {
		this.pause();
		this.playbackSource = 'manifest';
		this.processed = processed;
		this.isDeterministic = opts.isDeterministic ?? false;
		this.words = [];
		this.headings = [];

		const processor = getDocumentProcessor(processed.processorId);
		this.uxProfile = processor.getReaderUxProfile();

		this.currentSectionIndex = clamp(
			opts.sectionIndex ?? 0,
			0,
			Math.max(this.getSectionCount() - 1, 0)
		);

		const stream = this.getActiveStream();
		const maxToken = Math.max(stream.length - 1, 0);
		this.currentTokenIndex = clamp(opts.tokenIndex ?? 0, 0, maxToken);

		this.rebuildSentenceUnits();
		this.emitState(false);
	}

	loadDeterministic(
		bundle: NormalizedDocumentBundle,
		modeId: ProcessingModeId,
		opts: LoadDeterministicOptions = {}
	) {
		let tokenIndex = opts.tokenIndex;

		if (
			modeId === 'single_story' &&
			opts.parsed !== undefined &&
			opts.editorOffset !== undefined &&
			tokenIndex === undefined
		) {
			const story = bundleToStoryProcessed(bundle);
			if (story.kind === 'single_story') {
				tokenIndex = findStoryTokenIndexForOffset(
					story.stream,
					opts.parsed,
					opts.editorOffset
				);
			}
		}

		const processed =
			modeId === 'sections'
				? bundleToSectionsProcessed(bundle)
				: bundleToStoryProcessed(bundle);

		this.loadProcessedDocument(processed, {
			sectionIndex: opts.sectionIndex,
			tokenIndex,
			isDeterministic: true
		});
	}

	getReaderUxProfile(): ReaderUxProfile | null {
		return this.uxProfile;
	}

	setSettings(settings: SpeedReaderAiSettings) {
		this.settings = settings;
		this.micropauseService.updateSettings(settings);
		this.emitState(false);
	}

	getPlaybackMode(): PlaybackMode {
		return this.playbackMode;
	}

	setPlaybackMode(mode: PlaybackMode) {
		if (this.playbackMode === mode) {
			return;
		}
		this.playbackMode = mode;
		this.emitState(false);
		this.restartLoopIfPlaying();
	}

	togglePlaybackMode(): PlaybackMode {
		this.setPlaybackMode(this.playbackMode === 'rsvp' ? 'lineRepeat' : 'rsvp');
		return this.playbackMode;
	}

	nextLine() {
		const units = this.sentenceUnits;
		if (units.length === 0) {
			return;
		}

		const seekIndex = this.getCurrentSeekIndex();
		const unitIndex = findSentenceUnitForSeekIndex(units, seekIndex);
		const nextIndex = nextLineUnitIndex(units, unitIndex);

		if (nextIndex === unitIndex && unitIndex >= units.length - 1) {
			this.pause();
			this.isPlaying = false;
			this.emitState(true);
			this.onComplete();
			return;
		}

		this.seekToSentenceUnit(units[nextIndex]!);
	}

	prevLine() {
		const units = this.sentenceUnits;
		if (units.length === 0) {
			return;
		}

		const seekIndex = this.getCurrentSeekIndex();
		const unitIndex = findSentenceUnitForSeekIndex(units, seekIndex);
		const prevIndex = prevLineUnitIndex(units, unitIndex);
		this.seekToSentenceUnit(units[prevIndex]!);
	}

	getSettings(): SpeedReaderAiSettings {
		return this.settings;
	}

	getLoadedProcessedDocument(): ProcessedDocument | null {
		return this.processed;
	}

	getHeadings(): HeadingInfo[] {
		if (this.playbackSource === 'manifest' && this.processed?.kind === 'single_story') {
			return listStreamHeadings(this.processed.stream).map((h, i) => ({
				level: 2,
				text: h.title,
				wordIndex: h.tokenIndex
			}));
		}
		return this.headings;
	}

	getSectionList(): Array<{ id: string; title: string; order: number }> {
		if (!this.processed || !isSectionsProcessed(this.processed)) {
			return [];
		}
		return this.processed.sections.map((section, order) => ({
			id: section.sectionId,
			title: section.title,
			order
		}));
	}

	getStreamHeadings(): Array<{ title: string; tokenIndex: number }> {
		if (!this.processed || !isStoryProcessed(this.processed)) {
			return [];
		}
		return listStreamHeadings(this.processed.stream);
	}

	play() {
		if (this.playbackSource === 'manifest') {
			const stream = this.getActiveStream();
			if (stream.length === 0) {
				this.emitState(false);
				return;
			}
			if (this.currentTokenIndex >= stream.length) {
				this.currentTokenIndex = 0;
			}
		} else if (this.words.length === 0) {
			this.emitState(false);
			return;
		} else if (this.currentIndex >= this.words.length) {
			this.currentIndex = 0;
		}

		if (this.isPlaying) {
			return;
		}

		this.isPlaying = true;
		if (this.playbackMode === 'lineRepeat') {
			if (this.playbackSource === 'manifest') {
				this.runLineRepeatManifestLoop();
			} else {
				this.runLineRepeatLegacyLoop();
			}
		} else if (this.playbackSource === 'manifest') {
			this.runManifestLoop();
		} else {
			this.runLoop();
		}
	}

	pause() {
		if (this.timeoutId !== null) {
			window.clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}
		this.isPlaying = false;
		this.emitState(false);
	}

	togglePlayPause() {
		if (this.isPlaying) {
			this.pause();
		} else {
			this.play();
		}
	}

	rewind(count: number) {
		if (this.playbackSource === 'manifest') {
			this.seekToToken(this.currentTokenIndex - count);
		} else {
			this.seekToIndex(this.currentIndex - count);
		}
	}

	fastForward(count: number) {
		if (this.playbackSource === 'manifest') {
			this.seekToToken(this.currentTokenIndex + count);
		} else {
			this.seekToIndex(this.currentIndex + count);
		}
	}

	rewindSmart(chunkSize = SMART_NAV_CHUNK_SIZE) {
		const navWords = this.getNavWords();
		if (navWords.length === 0) {
			return;
		}

		const currentWordIdx = this.getCurrentWordIndex(navWords);
		const targetWordIdx = computeSmartRewindTarget(currentWordIdx, navWords, chunkSize);
		this.seekToNavWord(navWords[targetWordIdx]!);
	}

	fastForwardSmart(chunkSize = SMART_NAV_CHUNK_SIZE) {
		const navWords = this.getNavWords();
		if (navWords.length === 0) {
			return;
		}

		const currentWordIdx = this.getCurrentWordIndex(navWords);
		const targetWordIdx = computeSmartForwardTarget(currentWordIdx, navWords, chunkSize);
		this.seekToNavWord(navWords[targetWordIdx]!);
	}

	getPauseContext(radiusWords = PAUSE_CONTEXT_RADIUS): PauseContextToken[] {
		const navWords = this.getNavWords();
		if (navWords.length === 0) {
			return [];
		}

		const currentWordIndices = this.getCurrentChunkWordIndices(navWords);
		return buildPauseContext(navWords, currentWordIndices, radiusWords);
	}

	seekToIndex(index: number) {
		if (this.playbackSource === 'manifest') {
			this.seekToToken(index);
			return;
		}

		const last = Math.max(this.words.length - 1, 0);
		this.currentIndex = clamp(index, 0, last);
		this.emitState(false);
		this.restartLoopIfPlaying();
	}

	seekToToken(index: number) {
		const stream = this.getActiveStream();
		const last = Math.max(stream.length - 1, 0);
		this.currentTokenIndex = clamp(index, 0, last);
		this.emitState(false);
		this.restartLoopIfPlaying();
	}

	seekToPercent(percent: number) {
		const clamped = clamp(percent, 0, 1);
		if (this.playbackSource === 'manifest') {
			const stream = this.getActiveStream();
			this.seekToToken(Math.floor(clamped * stream.length));
		} else {
			this.seekToIndex(Math.floor(clamped * this.words.length));
		}
	}

	jumpToHeading(headingWordIndex: number) {
		if (this.playbackSource === 'manifest') {
			this.seekToToken(headingWordIndex);
		} else {
			this.seekToIndex(headingWordIndex);
		}
	}

	seekToHeading(titleOrId: string) {
		if (!this.processed || !isStoryProcessed(this.processed)) {
			return;
		}
		const index = findHeadingTokenIndex(this.processed.stream, titleOrId);
		this.seekToToken(index);
	}

	goToSection(idOrIndex: string | number) {
		if (!this.processed || !isSectionsProcessed(this.processed)) {
			return;
		}

		let index: number;
		if (typeof idOrIndex === 'number') {
			index = idOrIndex;
		} else {
			index = this.processed.sections.findIndex((s) => s.sectionId === idOrIndex);
			if (index === -1) {
				return;
			}
		}

		this.currentSectionIndex = clamp(
			index,
			0,
			Math.max(this.processed.sections.length - 1, 0)
		);
		this.currentTokenIndex = 0;
		this.rebuildSentenceUnits();
		this.emitState(false);
		this.restartLoopIfPlaying();
	}

	nextSection() {
		if (!this.processed || !isSectionsProcessed(this.processed)) {
			return;
		}
		if (this.currentSectionIndex >= this.processed.sections.length - 1) {
			return;
		}
		this.goToSection(this.currentSectionIndex + 1);
	}

	prevSection() {
		if (!this.processed || !isSectionsProcessed(this.processed)) {
			return;
		}
		if (this.currentSectionIndex <= 0) {
			return;
		}
		this.goToSection(this.currentSectionIndex - 1);
	}

	adjustWpm(delta: number): number {
		this.settings.reader.wpm = clamp(this.settings.reader.wpm + delta, 50, 5000);
		this.emitState(false);
		return this.settings.reader.wpm;
	}

	getCurrentSentenceText(): string {
		const navWords = this.getNavWords();
		if (navWords.length === 0 || this.sentenceUnits.length === 0) {
			return '';
		}

		const seekIndex = this.getCurrentSeekIndex();
		const unitIndex = findSentenceUnitForSeekIndex(this.sentenceUnits, seekIndex);
		const unit = this.sentenceUnits[unitIndex];
		if (!unit) {
			return '';
		}

		const slice = navWords.slice(unit.startWordIdx, unit.endWordIdx + 1);
		return slice.map((word) => word.display).join(' ').trim();
	}

	getContext(contextWords: number): { before: string[]; after: string[] } {
		if (this.playbackSource === 'manifest') {
			return this.getManifestContext(contextWords);
		}

		const chunkEnd = Math.min(this.currentIndex + this.settings.reader.chunkSize, this.words.length);
		const beforeStart = Math.max(0, this.currentIndex - contextWords);
		const afterEnd = Math.min(this.words.length, chunkEnd + contextWords);

		const before = this.words.slice(beforeStart, this.currentIndex).map((word) => `${word.word}${word.punctuation}`);
		const after = this.words.slice(chunkEnd, afterEnd).map((word) => `${word.word}${word.punctuation}`);

		return { before, after };
	}

	private getNavWords() {
		if (this.playbackSource === 'manifest') {
			return navWordsFromStream(this.getActiveStream());
		}
		return navWordsFromLegacy(this.words);
	}

	private getCurrentWordIndex(navWords: ReturnType<typeof navWordsFromLegacy>) {
		if (this.playbackSource === 'manifest') {
			return wordIndexForSeekIndex(navWords, this.currentTokenIndex);
		}
		return clamp(this.currentIndex, 0, Math.max(this.words.length - 1, 0));
	}

	private getCurrentChunkWordIndices(navWords: ReturnType<typeof navWordsFromLegacy>) {
		if (this.playbackSource === 'manifest') {
			const stream = this.getActiveStream();
			return wordIndicesForManifestChunk(
				navWords,
				this.currentTokenIndex,
				this.settings.reader.chunkSize,
				stream.length
			);
		}
		return wordIndicesForLegacyChunk(
			this.currentIndex,
			this.settings.reader.chunkSize,
			this.words.length
		);
	}

	private seekToNavWord(navWord: { seekIndex: number }) {
		if (this.playbackSource === 'manifest') {
			this.seekToToken(navWord.seekIndex);
		} else {
			this.seekToIndex(navWord.seekIndex);
		}
	}

	private getManifestContext(contextWords: number): { before: string[]; after: string[] } {
		const stream = this.getActiveStream();
		const before: string[] = [];
		const after: string[] = [];

		for (let i = this.currentTokenIndex - 1; i >= 0 && before.length < contextWords; i--) {
			const token = stream[i];
			if (token?.kind === 'word' && token.text) {
				before.unshift(token.text);
			}
		}

		const chunkEnd = Math.min(
			this.currentTokenIndex + this.settings.reader.chunkSize,
			stream.length
		);
		for (let i = chunkEnd; i < stream.length && after.length < contextWords; i++) {
			const token = stream[i];
			if (token?.kind === 'word' && token.text) {
				after.push(token.text);
			}
		}

		return { before, after };
	}

	private clearManifestState() {
		this.processed = null;
		this.uxProfile = null;
		this.isDeterministic = false;
		this.currentSectionIndex = 0;
		this.currentTokenIndex = 0;
	}

	private getSectionCount(): number {
		if (!this.processed || !isSectionsProcessed(this.processed)) {
			return 0;
		}
		return this.processed.sections.length;
	}

	private getActiveSection(): ProcessedSection | null {
		if (!this.processed || !isSectionsProcessed(this.processed)) {
			return null;
		}
		return this.processed.sections[this.currentSectionIndex] ?? null;
	}

	private getActiveStream(): StreamToken[] {
		if (!this.processed) {
			return [];
		}
		if (isSectionsProcessed(this.processed)) {
			return this.getActiveSection()?.stream ?? [];
		}
		if (isStoryProcessed(this.processed)) {
			return this.processed.stream;
		}
		return [];
	}

	private restartLoopIfPlaying() {
		if (this.isPlaying) {
			if (this.timeoutId !== null) {
				window.clearTimeout(this.timeoutId);
				this.timeoutId = null;
			}
			if (this.playbackMode === 'lineRepeat') {
				if (this.playbackSource === 'manifest') {
					this.runLineRepeatManifestLoop();
				} else {
					this.runLineRepeatLegacyLoop();
				}
			} else if (this.playbackSource === 'manifest') {
				this.runManifestLoop();
			} else {
				this.runLoop();
			}
		}
	}

	private runLoop() {
		if (!this.isPlaying) {
			return;
		}

		if (this.currentIndex >= this.words.length) {
			this.isPlaying = false;
			this.emitState(true);
			this.onComplete();
			return;
		}

		this.emitState(false);

		const delay = this.getCurrentDelay();
		this.timeoutId = window.setTimeout(() => {
			this.currentIndex += this.settings.reader.chunkSize;
			this.timeoutId = null;
			this.runLoop();
		}, delay);
	}

	private runManifestLoop() {
		if (!this.isPlaying) {
			return;
		}

		const stream = this.getActiveStream();

		if (this.currentTokenIndex >= stream.length) {
			if (this.processed && isSectionsProcessed(this.processed)) {
				if (this.currentSectionIndex < this.processed.sections.length - 1) {
					this.isPlaying = false;
					this.emitState(false);
					this.onSectionComplete?.();
					return;
				}
			}

			this.isPlaying = false;
			this.emitState(true);
			this.onComplete();
			return;
		}

		this.emitState(false);

		const { tokens, endIndex } = getWordTokensChunk(
			stream,
			this.currentTokenIndex,
			this.settings.reader.chunkSize
		);
		const delay = getDelayForTokens(tokens, this.settings, this.micropauseService);

		this.timeoutId = window.setTimeout(() => {
			this.currentTokenIndex = endIndex;
			this.timeoutId = null;
			this.runManifestLoop();
		}, delay);
	}

	private runLineRepeatLegacyLoop() {
		if (!this.isPlaying) {
			return;
		}

		if (this.currentIndex >= this.words.length) {
			this.isPlaying = false;
			this.emitState(true);
			this.onComplete();
			return;
		}

		this.emitState(false);

		const delay = this.getCurrentDelay();
		const nextIndex = this.currentIndex + this.settings.reader.chunkSize;

		this.timeoutId = window.setTimeout(() => {
			this.timeoutId = null;
			const result = computeLineRepeatAdvance(
				this.sentenceUnits,
				this.currentIndex,
				nextIndex,
				this.settings.reader.lineRepeatGapMs,
				false
			);

			if (result.action === 'complete') {
				this.isPlaying = false;
				this.emitState(true);
				this.onComplete();
				return;
			}

			if (result.action === 'loop') {
				this.currentIndex = result.nextSeekIndex;
				this.timeoutId = window.setTimeout(() => {
					this.timeoutId = null;
					this.runLineRepeatLegacyLoop();
				}, result.extraDelayMs);
				return;
			}

			this.currentIndex = result.nextSeekIndex;
			this.runLineRepeatLegacyLoop();
		}, delay);
	}

	private runLineRepeatManifestLoop() {
		if (!this.isPlaying) {
			return;
		}

		const stream = this.getActiveStream();

		if (this.currentTokenIndex >= stream.length) {
			if (this.processed && isSectionsProcessed(this.processed)) {
				if (this.currentSectionIndex < this.processed.sections.length - 1) {
					this.isPlaying = false;
					this.emitState(false);
					this.onSectionComplete?.();
					return;
				}
			}

			this.isPlaying = false;
			this.emitState(true);
			this.onComplete();
			return;
		}

		this.emitState(false);

		const { tokens, endIndex } = getWordTokensChunk(
			stream,
			this.currentTokenIndex,
			this.settings.reader.chunkSize
		);
		const delay = getDelayForTokens(tokens, this.settings, this.micropauseService);

		this.timeoutId = window.setTimeout(() => {
			this.timeoutId = null;
			const result = computeLineRepeatAdvance(
				this.sentenceUnits,
				this.currentTokenIndex,
				endIndex,
				this.settings.reader.lineRepeatGapMs,
				true,
				stream.length
			);

			if (result.action === 'complete') {
				this.isPlaying = false;
				this.emitState(true);
				this.onComplete();
				return;
			}

			if (result.action === 'loop') {
				this.currentTokenIndex = result.nextSeekIndex;
				this.timeoutId = window.setTimeout(() => {
					this.timeoutId = null;
					this.runLineRepeatManifestLoop();
				}, result.extraDelayMs);
				return;
			}

			this.currentTokenIndex = result.nextSeekIndex;
			this.runLineRepeatManifestLoop();
		}, delay);
	}

	private rebuildSentenceUnits() {
		this.sentenceUnits = buildSentenceUnits(this.getNavWords());
	}

	private getCurrentSeekIndex(): number {
		return this.playbackSource === 'manifest' ? this.currentTokenIndex : this.currentIndex;
	}

	private seekToSentenceUnit(unit: SentenceUnit) {
		if (this.playbackSource === 'manifest') {
			this.seekToToken(unit.startSeekIndex);
		} else {
			this.seekToIndex(unit.startSeekIndex);
		}
	}

	private getLineRepeatProgress(): number {
		if (this.sentenceUnits.length === 0) {
			return 0;
		}
		const unitIndex = findSentenceUnitForSeekIndex(this.sentenceUnits, this.getCurrentSeekIndex());
		return ((unitIndex + 1) / this.sentenceUnits.length) * 100;
	}

	private getLineRepeatStateFields() {
		const lineCount = this.sentenceUnits.length;
		if (lineCount === 0) {
			return {
				currentLineIndex: undefined,
				lineCount: undefined,
				lineBoundary: undefined
			};
		}

		const seekIndex = this.getCurrentSeekIndex();
		const unitIndex = findSentenceUnitForSeekIndex(this.sentenceUnits, seekIndex);
		const unit = this.sentenceUnits[unitIndex];
		return {
			currentLineIndex: unitIndex,
			lineCount,
			lineBoundary: getLineBoundary(this.sentenceUnits, unitIndex, seekIndex),
			lineStartSeekIndex: unit?.startSeekIndex,
			lineEndSeekIndex: unit?.endSeekIndex
		};
	}

	private getCurrentChunk(): WordData[] {
		if (this.playbackSource === 'manifest') {
			const stream = this.getActiveStream();
			if (this.currentTokenIndex >= stream.length) {
				return [];
			}
			const { tokens } = getWordTokensChunk(
				stream,
				this.currentTokenIndex,
				this.settings.reader.chunkSize
			);
			return tokensToDisplayChunk(tokens);
		}

		if (this.currentIndex >= this.words.length) {
			return [];
		}

		const end = Math.min(this.currentIndex + this.settings.reader.chunkSize, this.words.length);
		return this.words.slice(this.currentIndex, end);
	}

	private getCurrentDelay(): number {
		const chunk = this.getCurrentChunk();
		if (chunk.length === 0) {
			return 0;
		}

		const baseDelay = 60000 / this.settings.reader.wpm;
		let multiplier = 1;

		for (const word of chunk) {
			multiplier = Math.max(multiplier, this.micropauseService.getWordMultiplier(word));
		}

		if (this.settings.reader.enableMicropause && this.crossesParagraphBoundary(chunk)) {
			multiplier = Math.max(multiplier, 1 + (2.2 - 1) * this.settings.reader.micropauseIntensity);
		}

		if (this.settings.reader.enableMicropause && this.startsAtHeading(this.currentIndex)) {
			multiplier = Math.max(multiplier, 1 + (1.8 - 1) * this.settings.reader.micropauseIntensity);
		}

		return baseDelay * multiplier;
	}

	private crossesParagraphBoundary(chunk: WordData[]): boolean {
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
		const nextWord = this.words[this.currentIndex + chunk.length];
		if (lastChunkWord && nextWord) {
			const gap = nextWord.start - lastChunkWord.end;
			return gap >= 2;
		}

		return false;
	}

	private startsAtHeading(index: number): boolean {
		return this.headings.some((heading) => heading.wordIndex === index);
	}

	private getCurrentHeading(): HeadingInfo | null {
		if (this.playbackSource === 'manifest' && this.processed?.kind === 'single_story') {
			const headings = this.getHeadings();
			let current: HeadingInfo | null = null;
			for (const heading of headings) {
				if (heading.wordIndex <= this.currentTokenIndex) {
					current = heading;
				} else {
					break;
				}
			}
			return current;
		}

		let current: HeadingInfo | null = null;
		for (const heading of this.headings) {
			if (heading.wordIndex <= this.currentIndex) {
				current = heading;
			} else {
				break;
			}
		}
		return current;
	}

	private calculateRemainingMs(): number {
		if (this.playbackSource === 'manifest') {
			const stream = this.getActiveStream();
			let total = 0;
			for (let i = this.currentTokenIndex; i < stream.length; ) {
				const { tokens, endIndex } = getWordTokensChunk(stream, i, this.settings.reader.chunkSize);
				if (tokens.length === 0) {
					break;
				}
				total += getDelayForTokens(tokens, this.settings, this.micropauseService);
				i = endIndex;
			}
			return total;
		}

		if (this.currentIndex >= this.words.length) {
			return 0;
		}

		const baseDelay = 60000 / this.settings.reader.wpm;
		let total = 0;

		for (let index = this.currentIndex; index < this.words.length; index += this.settings.reader.chunkSize) {
			const chunk = this.words.slice(index, Math.min(index + this.settings.reader.chunkSize, this.words.length));
			let multiplier = 1;
			for (const word of chunk) {
				multiplier = Math.max(multiplier, this.micropauseService.getWordMultiplier(word));
			}

			total += baseDelay * multiplier;
		}

		return total;
	}

	private getChunkSeekIndices(): number[] {
		if (this.playbackSource === 'manifest') {
			const stream = this.getActiveStream();
			const indices: number[] = [];
			let collected = 0;

			for (let i = this.currentTokenIndex; i < stream.length && collected < this.settings.reader.chunkSize; i++) {
				const token = stream[i];
				if (token?.kind === 'word') {
					indices.push(i);
					collected++;
				} else if (indices.length === 0 && collected === 0) {
					indices.push(i);
					collected++;
					break;
				}
			}

			if (indices.length === 0 && stream.length > 0) {
				return [Math.min(this.currentTokenIndex, stream.length - 1)];
			}

			return indices;
		}

		const indices: number[] = [];
		for (
			let i = this.currentIndex;
			i < Math.min(this.currentIndex + this.settings.reader.chunkSize, this.words.length);
			i++
		) {
			indices.push(i);
		}
		return indices.length > 0 ? indices : [Math.min(this.currentIndex, Math.max(this.words.length - 1, 0))];
	}

	private emitState(finished: boolean) {
		const chunk = this.getCurrentChunk();
		const lineFields = this.getLineRepeatStateFields();
		const playbackMode = this.playbackMode;
		const chunkSeekIndices = this.getChunkSeekIndices();

		if (this.playbackSource === 'manifest') {
			const stream = this.getActiveStream();
			const totalTokens = stream.length;
			const progress =
				playbackMode === 'lineRepeat'
					? this.getLineRepeatProgress()
					: totalTokens > 0
						? Math.min((this.currentTokenIndex / totalTokens) * 100, 100)
						: 0;

			const activeSection = this.getActiveSection();
			const { tokens } = getWordTokensChunk(
				stream,
				this.currentTokenIndex,
				this.settings.reader.chunkSize
			);

			this.onStateChange({
				chunk,
				currentIndex: this.currentTokenIndex,
				totalWords: totalTokens,
				progress,
				isPlaying: this.isPlaying,
				finished,
				currentWpm: this.settings.reader.wpm,
				timeRemainingMs: this.calculateRemainingMs(),
				currentHeading: this.getCurrentHeading(),
				playbackMode,
				...lineFields,
				chunkSeekIndices,
				playbackSource: 'manifest',
				progressScope: this.uxProfile?.progressScope,
				currentSectionIndex: this.currentSectionIndex,
				sectionCount: this.getSectionCount(),
				sectionTitle: activeSection?.title,
				currentTokenIndex: this.currentTokenIndex,
				totalTokens,
				displayToken: primaryDisplayToken(tokens),
				isDeterministic: this.isDeterministic
			});
			return;
		}

		const totalWords = this.words.length;
		const progress =
			playbackMode === 'lineRepeat'
				? this.getLineRepeatProgress()
				: totalWords > 0
					? Math.min((this.currentIndex / totalWords) * 100, 100)
					: 0;

		this.onStateChange({
			chunk,
			currentIndex: this.currentIndex,
			totalWords,
			progress,
			isPlaying: this.isPlaying,
			finished,
			currentWpm: this.settings.reader.wpm,
			timeRemainingMs: this.calculateRemainingMs(),
			currentHeading: this.getCurrentHeading(),
			playbackMode,
			...lineFields,
			chunkSeekIndices,
			playbackSource: 'legacy'
		});
	}
}
