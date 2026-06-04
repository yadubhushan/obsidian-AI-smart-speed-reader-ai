export type {
	DocumentSection,
	DocumentSegment,
	ParseSegmentsOptions,
	ParsedSegments,
	SegmentKind
} from './parse/segmentTypes';

export type {
	NormalizedDocumentBundle,
	NormalizedSegment,
	SectionSegmentBundle
} from './parse/normalizeTypes';

export { normalizeDocument } from './parse/normalizeSegments';

export type {
	DocumentCacheIndex,
	DocumentProcessor,
	LlmSectionsResponse,
	LlmStoryResponse,
	ModeCacheEntry,
	ModeCacheStatus,
	ProcessedDocument,
	ProcessedDocumentMeta,
	ProcessedSection,
	ProcessingModeId,
	ProcessorDeps,
	ReaderUxProfile,
	SectionIndexEntry,
	SectionsModeIndex,
	SingleStoryManifest,
	SpeedReadSectionManifest,
	StreamToken,
	StreamTokenKind
} from './types/processedDocument';


export type PlaybackMode = 'rsvp' | 'progressiveRsvp' | 'lineByLine' | 'lineRepeat';

export type ReaderColorScheme = 'dark' | 'light' | 'auto';
export type ReaderThemePresetId =
	| 'vintage-amber'
	| 'cyber-mint'
	| 'nova-violet'
	| 'crimson-surge';
export type LlmBackend = 'auto' | 'cursor-cli' | 'ai-providers' | 'openai-compatible';
export type ApiProviderPreset = 'openai' | 'openrouter' | 'custom';

export const READER_FONT_OPTIONS = ['system-ui', 'Arial', 'Georgia', 'monospace'] as const;
export type ReaderFontOption = (typeof READER_FONT_OPTIONS)[number];

export interface ReaderDisplaySettings {
	showRemainingTime: boolean;
	showContext: boolean;
	showProgress: boolean;
	showCenterGuide: boolean;
}

export interface ReaderTextOrientationSettings {
	rtl: boolean;
	autoDetect: boolean;
}

export interface ReaderAutoStartSettings {
	enabled: boolean;
	seconds: number;
}

export interface ReaderSettings {
	font: ReaderFontOption;
	fontSize: number;
	wpm: number;
	chunkSize: number;
	colorScheme: ReaderColorScheme;
	themePreset: ReaderThemePresetId;
	autoStart: ReaderAutoStartSettings;
	autoCloseOnCompletion: boolean;
	textOrientation: ReaderTextOrientationSettings;
	display: ReaderDisplaySettings;
	defaultPlaybackMode: PlaybackMode;
	/** Words with letter count ≤ threshold may bundle in Progressive RSVP mode. */
	progressiveRsvpMaxWordLength: number;
	lineRepeatGapMs: number;
	enableMicropause: boolean;
	micropauseIntensity: number;
	/** Words on each side of current word in context line */
	contextWords: number;
	/** Font size (px) for paused context line subtitle */
	contextLineFontSize: number;
	requireCompletionBeforeNewBook: boolean;
}

export interface AiSettings {
	llmBackend: LlmBackend;
	aiProvidersProviderId: string;
	apiProviderPreset: ApiProviderPreset;
	apiKey: string;
	apiBaseUrl: string;
	apiModel: string;
	cursorCliPath: string;
	llmModel: string;
	timeoutSeconds: number;
	prepareSingleCallMaxChars: number;
	prepareSingleCallMaxLines: number;
	maxPrepareVersions: number;
}

export interface BookmarkSettings {
	bookBookmarkNoteTemplate: string;
	noteBookmarkSectionHeading: string;
}

export interface DictionarySettings {
	enableWordLookup: boolean;
	dictionaryCacheEnabled: boolean;
	merriamWebsterApiKey: string;
	dictionaryNotePath: string;
}

export interface WordData {
	raw: string;
	word: string;
	punctuation: string;
	orpIndex: number;
	start: number;
	end: number;
}

export interface HeadingInfo {
	level: number;
	text: string;
	wordIndex: number;
}

export interface SpeedReaderAiSettings {
	reader: ReaderSettings;
	ai: AiSettings;
	bookmarks: BookmarkSettings;
	dictionary: DictionarySettings;
}

export interface ReaderState {
	chunk: WordData[];
	currentIndex: number;
	totalWords: number;
	progress: number;
	isPlaying: boolean;
	finished: boolean;
	currentWpm: number;
	timeRemainingMs: number;
	currentHeading: HeadingInfo | null;
	playbackMode: PlaybackMode;
	currentLineIndex?: number;
	lineCount?: number;
	lineBoundary?: { isStart: boolean; isEnd: boolean };
	lineStartSeekIndex?: number;
	lineEndSeekIndex?: number;
	chunkSeekIndices?: number[];
	/** Manifest playback (undefined for legacy loadText). */
	playbackSource?: 'legacy' | 'manifest';
	progressScope?: 'section' | 'document';
	currentSectionIndex?: number;
	sectionCount?: number;
	sectionTitle?: string;
	currentTokenIndex?: number;
	totalTokens?: number;
	displayToken?: {
		kind: import('./types/processedDocument').StreamTokenKind;
		text?: string;
		orpIndex?: number;
		alt?: string;
	};
	isDeterministic?: boolean;
}

export interface ParsedDocument {
	words: WordData[];
	headings: HeadingInfo[];
	startWordIndex: number;
}

export const DEFAULT_SETTINGS: SpeedReaderAiSettings = {
	reader: {
		font: 'system-ui',
		fontSize: 110,
		wpm: 200,
		chunkSize: 1,
		colorScheme: 'dark',
		themePreset: 'vintage-amber',
		autoStart: { enabled: false, seconds: 3 },
		autoCloseOnCompletion: false,
		textOrientation: { rtl: false, autoDetect: true },
		display: {
			showRemainingTime: true,
			showContext: true,
			showProgress: true,
			showCenterGuide: true
		},
		defaultPlaybackMode: 'rsvp',
		progressiveRsvpMaxWordLength: 4,
		lineRepeatGapMs: 600,
		enableMicropause: true,
		micropauseIntensity: 1.5,
		contextWords: 8,
		contextLineFontSize: 18,
		requireCompletionBeforeNewBook: false
	},
	ai: {
		llmBackend: 'auto',
		aiProvidersProviderId: '',
		apiProviderPreset: 'openai',
		apiKey: '',
		apiBaseUrl: '',
		apiModel: 'gpt-4o-mini',
		cursorCliPath: '',
		llmModel: 'composer-2.5-fast',
		timeoutSeconds: 300,
		prepareSingleCallMaxChars: 120000,
		prepareSingleCallMaxLines: 2000,
		maxPrepareVersions: 10
	},
	bookmarks: {
		bookBookmarkNoteTemplate: 'docs/Areas/books/bookmarks/{book_name}.md',
		noteBookmarkSectionHeading: 'Speed Reader Bookmarks'
	},
	dictionary: {
		enableWordLookup: true,
		dictionaryCacheEnabled: true,
		merriamWebsterApiKey: '',
		dictionaryNotePath: 'dictionary.md'
	}
};
