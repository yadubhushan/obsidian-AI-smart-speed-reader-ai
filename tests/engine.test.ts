/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RSVPEngine } from '../src/engine/rsvpEngine';
import { getDelayForToken, IMAGE_MIN_PAUSE_MS } from '../src/engine/manifestPlayback';
import { MicropauseService } from '../src/services/micropauseService';
import { DEFAULT_SETTINGS } from '../src/types';
import type { SpeedReaderAiSettings, ReaderState } from '../src/types';
import {
	overviewBundle,
	sampleSectionsProcessed,
	sampleStoryProcessed,
	OVERVIEW_EXCERPT
} from './prepareFixtures';
import { parseSegments } from '../src/parse/segmentParser';

describe('RSVPEngine', () => {
	let engine: RSVPEngine;
	let stateChanges: ReaderState[];
	let Completes: number[];
	const settings: SpeedReaderAiSettings = structuredClone(DEFAULT_SETTINGS);

	beforeEach(() => {
		vi.useFakeTimers();
		stateChanges = [];
		Completes = [];
		engine = new RSVPEngine(
			settings,
			(state) => stateChanges.push(state),
			() => Completes.push(1)
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('loads text and parses words', () => {
		engine.loadText('Hello world');
		expect(stateChanges.length).toBeGreaterThan(0);
		expect(stateChanges[0]!.totalWords).toBe(2);
	});

	it('starts playing when play() is called', () => {
		engine.loadText('One two three');
		engine.play();
		expect(stateChanges[stateChanges.length - 1]!.isPlaying).toBe(true);
	});

	it('pauses when pause() is called', () => {
		engine.loadText('One two three');
		engine.play();
		engine.pause();
		expect(stateChanges[stateChanges.length - 1]!.isPlaying).toBe(false);
	});

	it('toggles play/pause', () => {
		engine.loadText('One two three');
		engine.togglePlayPause();
		expect(stateChanges[stateChanges.length - 1]!.isPlaying).toBe(true);
		engine.togglePlayPause();
		expect(stateChanges[stateChanges.length - 1]!.isPlaying).toBe(false);
	});

	it('advances words on timeout', () => {
		engine.loadText('One two three four five');
		engine.play();
		const initialIndex = stateChanges[0]!.currentIndex;
		vi.advanceTimersByTime(2000);
		const laterIndex = stateChanges[stateChanges.length - 1]!.currentIndex;
		expect(laterIndex).toBeGreaterThan(initialIndex);
	});

	it('resumes from beginning after finishing', () => {
		engine.loadText('One');
		engine.play();
		vi.advanceTimersByTime(1000);
		expect(stateChanges.some(s => s.finished)).toBe(true);
		engine.play();
		expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBe(0);
	});

	it('adjusts WPM', () => {
		engine.loadText('Hello');
		const newWpm = engine.adjustWpm(50);
		expect(newWpm).toBe(DEFAULT_SETTINGS.reader.wpm + 50);
	});

	it('clamps WPM to min 50', () => {
		engine.loadText('Hello');
		const newWpm = engine.adjustWpm(-500);
		expect(newWpm).toBe(50);
	});

	it('clamps WPM to max 5000', () => {
		engine.loadText('Hello');
		const newWpm = engine.adjustWpm(5000);
		expect(newWpm).toBe(5000);
	});

	it('rewinds by word count', () => {
		engine.loadText('One two three four five');
		engine.play();
		vi.advanceTimersByTime(500);
		engine.pause();
		const beforeRewind = stateChanges[stateChanges.length - 1]!.currentIndex;
		engine.rewind(2);
		const afterRewind = stateChanges[stateChanges.length - 1]!.currentIndex;
		expect(afterRewind).toBeLessThan(beforeRewind);
	});

	it('fast forwards by word count', () => {
		engine.loadText('One two three four five');
		engine.fastForward(2);
		expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBe(2);
	});

	it('rewindSmart moves back in chunks and respects sentence boundaries', () => {
		const words = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
		engine.loadText(`${words}. more words here.`);
		engine.play();
		vi.advanceTimersByTime(3000);
		engine.pause();
		const before = stateChanges[stateChanges.length - 1]!.currentIndex;
		engine.rewindSmart();
		const after = stateChanges[stateChanges.length - 1]!.currentIndex;
		expect(after).toBeLessThan(before);
	});

	it('getPauseContext returns tokens with a current word marked', () => {
		engine.loadText('Alpha beta gamma delta epsilon.');
		engine.pause();
		const ctx = engine.getPauseContext(5);
		expect(ctx.length).toBeGreaterThan(0);
		expect(ctx.some((t) => t.isCurrent)).toBe(true);
	});

	it('getBookmarkPassage returns paragraph with highlighted sentence', () => {
		const base = sampleSectionsProcessed();
		engine.loadProcessedDocument({
			...base,
			sections: [
				{
					sectionId: 's1',
					title: 'Section',
					stream: [
						{ kind: 'word', text: 'First.' },
						{ kind: 'word', text: 'Second.' },
						{ kind: 'word', text: 'Third.' },
						{ kind: 'word', text: 'Fourth.' }
					],
					paragraphStarts: [0, 2]
				}
			]
		});
		engine.seekToToken(1);
		engine.pause();
		const passage = engine.getBookmarkPassage();
		expect(passage.highlightedSentence).toContain('Second');
		expect(passage.paragraphText).toContain('First');
		expect(passage.paragraphText).toContain('Second');
	});

	it('getBookmarkContextSnapshot returns sentence lines with current index', () => {
		engine.loadText('One two three. Four five six.');
		engine.seekToIndex(4);
		engine.pause();
		const snapshot = engine.getBookmarkContextSnapshot();
		expect(snapshot.lines.length).toBeGreaterThanOrEqual(2);
		expect(snapshot.lines[snapshot.currentLineIndex]?.text).toContain('Four');
	});

	it('seekToSentenceUnitIndex moves reading position', () => {
		engine.loadText('One two three. Four five six.');
		engine.seekToSentenceUnitIndex(1);
		expect(engine.getCurrentSentenceUnitIndex()).toBe(1);
	});

	it('getPauseSentenceContext returns full sentence tokens when paused', () => {
		engine.loadText('One two three. Four five six.');
		engine.seekToIndex(4);
		engine.pause();
		const ctx = engine.getPauseSentenceContext();
		expect(ctx).not.toBeNull();
		expect(ctx!.sentenceTokens.length).toBeGreaterThanOrEqual(2);
		expect(ctx!.sentenceTokens.some((t) => t.isCurrent)).toBe(true);
	});

	it('seeks to percentage', () => {
		engine.loadText('One two three four five six seven eight nine ten');
		engine.seekToPercent(0.5);
		expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBe(5);
	});

	it('updates settings', () => {
		engine.loadText('Hello');
		const newSettings = { ...settings, wpm: 500 };
		engine.setSettings(newSettings);
		expect(engine.getSettings().wpm).toBe(500);
	});

	it('returns headings', () => {
		engine.loadText('# Title\nSome text\n## Section\nMore text');
		const headings = engine.getHeadings();
		expect(headings.length).toBe(2);
		expect(headings[0]!.level).toBe(1);
		expect(headings[0]!.text).toBe('Title');
		expect(headings[1]!.level).toBe(2);
	});

	it('getContext returns surrounding words', () => {
		engine.loadText('One two three four five');
		engine.seekToIndex(2);
		const context = engine.getContext(1);
		expect(context.before).toContain('two');
		expect(context.after).toContain('four');
	});

	it('handles empty text', () => {
		engine.loadText('');
		expect(stateChanges[0]!.totalWords).toBe(0);
	});

	it('calculates progress', () => {
		engine.loadText('One two three four five');
		engine.seekToIndex(2);
		const progress = stateChanges[stateChanges.length - 1]!.progress;
		expect(progress).toBe(40);
	});

	it('engine starts paused after loadText', () => {
		engine.loadText('One two three');
		expect(stateChanges[stateChanges.length - 1]!.isPlaying).toBe(false);
	});
});

describe('RSVPEngine manifest playback', () => {
	let engine: RSVPEngine;
	let stateChanges: ReaderState[];
	let completes: number[];
	let sectionCompletes: number[];
	const settings: SpeedReaderAiSettings = structuredClone(DEFAULT_SETTINGS);
	settings.reader.wpm = 600;

	beforeEach(() => {
		vi.useFakeTimers();
		stateChanges = [];
		completes = [];
		sectionCompletes = [];
		engine = new RSVPEngine(
			settings,
			(state) => stateChanges.push(state),
			() => completes.push(1),
			() => sectionCompletes.push(1)
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('loads sections ProcessedDocument with section scope', () => {
		engine.loadProcessedDocument(sampleSectionsProcessed());
		const state = stateChanges[stateChanges.length - 1]!;
		expect(state.playbackSource).toBe('manifest');
		expect(state.progressScope).toBe('section');
		expect(state.sectionCount).toBe(2);
		expect(state.sectionTitle).toBe('AWS vs GCP');
	});

	it('loads single_story ProcessedDocument with document scope', () => {
		engine.loadProcessedDocument(sampleStoryProcessed());
		const state = stateChanges[stateChanges.length - 1]!;
		expect(state.progressScope).toBe('document');
		expect(state.totalTokens).toBe(2);
	});

	it('loadDeterministic builds sections without cache', () => {
		engine.loadDeterministic(overviewBundle(), 'sections');
		const state = stateChanges[stateChanges.length - 1]!;
		expect(state.isDeterministic).toBe(true);
		expect(state.sectionCount).toBeGreaterThan(0);
	});

	it('loadDeterministic builds single_story without cache', () => {
		engine.loadDeterministic(overviewBundle(), 'single_story');
		const state = stateChanges[stateChanges.length - 1]!;
		expect(state.isDeterministic).toBe(true);
		expect(state.progressScope).toBe('document');
	});

	it('goToSection resets token index and progress', () => {
		engine.loadProcessedDocument(sampleSectionsProcessed());
		engine.goToSection(1);
		const state = stateChanges[stateChanges.length - 1]!;
		expect(state.currentSectionIndex).toBe(1);
		expect(state.currentTokenIndex).toBe(0);
		expect(state.sectionTitle).toBe('Networking');
	});

	it('seekToHeading jumps within story stream', () => {
		const story = sampleStoryProcessed();
		engine.loadProcessedDocument(story);
		engine.seekToHeading('story');
		expect(stateChanges[stateChanges.length - 1]!.currentTokenIndex).toBe(0);
	});

	it('fires onSectionComplete at end of section in sections mode', () => {
		const shortSection = sampleSectionsProcessed();
		if (shortSection.kind === 'sections') {
			shortSection.sections[0]!.stream = [{ kind: 'word', text: 'Done' }];
		}
		engine.loadProcessedDocument(shortSection);
		engine.play();
		vi.advanceTimersByTime(5000);
		expect(sectionCompletes.length).toBe(1);
		expect(completes.length).toBe(0);
	});

	it('does not fire onSectionComplete in single_story mode', () => {
		engine.loadProcessedDocument(sampleStoryProcessed());
		engine.play();
		vi.advanceTimersByTime(5000);
		expect(sectionCompletes.length).toBe(0);
		expect(completes.length).toBe(1);
	});

	it('nextSection advances after onSectionComplete', () => {
		const shortSection = sampleSectionsProcessed();
		if (shortSection.kind === 'sections') {
			shortSection.sections[0]!.stream = [{ kind: 'word', text: 'Done' }];
		}
		engine.loadProcessedDocument(shortSection);
		engine.play();
		vi.advanceTimersByTime(5000);
		engine.nextSection();
		expect(stateChanges[stateChanges.length - 1]!.currentSectionIndex).toBe(1);
	});

	it('loadDeterministic with editor offset seeks story stream', () => {
		const parsed = parseSegments(OVERVIEW_EXCERPT);
		const networkingOffset = OVERVIEW_EXCERPT.indexOf('## Networking');
		engine.loadDeterministic(overviewBundle(), 'single_story', {
			parsed,
			editorOffset: networkingOffset
		});
		const state = stateChanges[stateChanges.length - 1]!;
		expect(state.currentTokenIndex).toBeGreaterThan(0);
	});

	it('getReaderUxProfile returns section arrows for sections', () => {
		engine.loadProcessedDocument(sampleSectionsProcessed());
		expect(engine.getReaderUxProfile()?.arrowKeys).toBe('section');
	});

	it('image token delay is at least IMAGE_MIN_PAUSE_MS', () => {
		const micropause = new MicropauseService(settings);
		const delay = getDelayForToken({ kind: 'image', alt: 'diagram' }, settings, micropause);
		expect(delay).toBeGreaterThanOrEqual(IMAGE_MIN_PAUSE_MS);
	});

	describe('line repeat mode', () => {
		it('loops at sentence end instead of advancing', () => {
			engine.setPlaybackMode('lineRepeat');
			engine.loadText('One two. Three four.');
			engine.play();

			const baseDelay = 60000 / settings.reader.wpm;
			vi.advanceTimersByTime(baseDelay * 2 + 50);
			expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBe(1);

			vi.advanceTimersByTime(baseDelay + settings.reader.lineRepeatGapMs + 50);
			expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBe(0);
			expect(stateChanges[stateChanges.length - 1]!.playbackMode).toBe('lineRepeat');
		});

		it('nextLine advances to the next sentence start', () => {
			engine.setPlaybackMode('lineRepeat');
			engine.loadText('First sentence. Second sentence.');
			engine.nextLine();

			expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBe(2);
			expect(stateChanges[stateChanges.length - 1]!.currentLineIndex).toBe(1);
		});

		it('prevLine moves to the previous sentence start', () => {
			engine.setPlaybackMode('lineRepeat');
			engine.loadText('First sentence. Second sentence.');
			engine.nextLine();
			engine.prevLine();

			expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBe(0);
			expect(stateChanges[stateChanges.length - 1]!.currentLineIndex).toBe(0);
		});

		it('marks line boundaries on first and last words', () => {
			engine.setPlaybackMode('lineRepeat');
			engine.loadText('Alpha beta.');
			engine.play();

			const playingState = stateChanges[stateChanges.length - 1]!;
			expect(playingState.lineBoundary).toEqual({ isStart: true, isEnd: false });

			const baseDelay = 60000 / settings.reader.wpm;
			vi.advanceTimersByTime(baseDelay + 50);
			expect(stateChanges[stateChanges.length - 1]!.lineBoundary).toEqual({
				isStart: false,
				isEnd: true
			});
		});

		it('uses line-based progress in line repeat mode', () => {
			engine.setPlaybackMode('lineRepeat');
			engine.loadText('One. Two. Three.');
			engine.play();

			const progress = stateChanges[stateChanges.length - 1]!.progress;
			expect(progress).toBeCloseTo((1 / 3) * 100, 5);
		});

		it('normal RSVP mode still advances through the document', () => {
			engine.setPlaybackMode('rsvp');
			engine.loadText('One two. Three four.');
			engine.play();

			const baseDelay = 60000 / settings.reader.wpm;
			vi.advanceTimersByTime(baseDelay * 3 + 50);
			expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBeGreaterThan(1);
		});
	});

	describe('line by line mode', () => {
		it('advances to next sentence at end instead of looping', () => {
			engine.setSettings({
				...settings,
				reader: { ...settings.reader, enableMicropause: false, wpm: 300 }
			});
			engine.setPlaybackMode('lineByLine');
			engine.loadText('One two. Three four.');
			engine.play();

			expect(stateChanges[stateChanges.length - 1]!.chunk.length).toBe(2);
			expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBe(0);

			const baseDelay = 60000 / 300;
			vi.advanceTimersByTime(baseDelay * 2 + 50);
			expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBe(2);

			vi.advanceTimersByTime(baseDelay * 2 + 50);
			expect(stateChanges[stateChanges.length - 1]!.finished).toBe(true);
			expect(stateChanges[stateChanges.length - 1]!.playbackMode).toBe('lineByLine');
		});

		it('nextLine and prevLine work in line by line mode', () => {
			engine.setPlaybackMode('lineByLine');
			engine.loadText('First sentence. Second sentence.');
			engine.nextLine();

			expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBe(2);
			expect(stateChanges[stateChanges.length - 1]!.currentLineIndex).toBe(1);

			engine.prevLine();
			expect(stateChanges[stateChanges.length - 1]!.currentIndex).toBe(0);
			expect(stateChanges[stateChanges.length - 1]!.currentLineIndex).toBe(0);
		});

		it('uses line-based progress in line by line mode', () => {
			engine.setPlaybackMode('lineByLine');
			engine.loadText('One. Two. Three.');
			engine.play();

			const progress = stateChanges[stateChanges.length - 1]!.progress;
			expect(progress).toBeCloseTo((1 / 3) * 100, 5);
		});
	});
});

describe('Visibility change auto-pause logic', () => {
	it('should pause when document becomes hidden and resume on return', () => {
		let wasPlayingBeforeBlur = false;
		const isPlaying = { value: false };

		const mockEngine = {
			pause: vi.fn(() => { isPlaying.value = false; }),
			play: vi.fn(() => { isPlaying.value = true; }),
		};

		isPlaying.value = true;

		const visibilityHandler = () => {
			if (document.hidden) {
				if (isPlaying.value) {
					wasPlayingBeforeBlur = true;
					mockEngine.pause();
				}
			} else {
				if (wasPlayingBeforeBlur) {
					wasPlayingBeforeBlur = false;
					mockEngine.play();
				}
			}
		};

		Object.defineProperty(document, 'hidden', { value: true, configurable: true });
		visibilityHandler();
		expect(mockEngine.pause).toHaveBeenCalledTimes(1);
		expect(wasPlayingBeforeBlur).toBe(true);

		Object.defineProperty(document, 'hidden', { value: false, configurable: true });
		visibilityHandler();
		expect(mockEngine.play).toHaveBeenCalledTimes(1);
		expect(wasPlayingBeforeBlur).toBe(false);
	});

	it('should not resume if not playing before blur', () => {
		let wasPlayingBeforeBlur = false;
		const isPlaying = { value: false };
		const mockEngine = {
			pause: vi.fn(),
			play: vi.fn(),
		};

		const visibilityHandler = () => {
			if (document.hidden) {
				if (isPlaying.value) {
					wasPlayingBeforeBlur = true;
					mockEngine.pause();
				}
			} else {
				if (wasPlayingBeforeBlur) {
					wasPlayingBeforeBlur = false;
					mockEngine.play();
				}
			}
		};

		Object.defineProperty(document, 'hidden', { value: true, configurable: true });
		visibilityHandler();
		expect(mockEngine.pause).not.toHaveBeenCalled();

		Object.defineProperty(document, 'hidden', { value: false, configurable: true });
		visibilityHandler();
		expect(mockEngine.play).not.toHaveBeenCalled();
	});
});