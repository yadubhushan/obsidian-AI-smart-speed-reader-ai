export type SourceKind = 'book' | 'note';
export type ReadingStatus = 'unread' | 'in_progress' | 'finished';
export type PlaybackMode = 'rsvp' | 'lineRepeat';

export interface BookPosition {
	chapterId: string;
	wordIndex: number;
}

export interface NotePosition {
	sectionId: string;
	wordIndex: number;
}

export type BookSectionKind = 'cover' | 'frontMatter' | 'body' | 'appendix';

export interface BookChapter {
	chapterId: string;
	title: string;
	wordCount: number;
	words: string[];
	/** True when this spine item is a cover page (often zero words). */
	isCover?: boolean;
	/** Classifier from nav or LLM ingest (optional). */
	sectionKind?: BookSectionKind;
}

export interface BookCacheIndex {
	docKey: string;
	sourcePath: string;
	sourceChecksum: string;
	title: string;
	author?: string;
	totalWordCount: number;
	chapters: BookChapter[];
	parsedAt: string;
}

export interface EnsureParsedOptions {
	/** Update or clear (null) the ingest progress overlay message. */
	onProgress?: (message: string | null) => void;
}

export interface BookCacheStore {
	get(docKey: string): Promise<BookCacheIndex | null>;
	ensureParsed(sourcePath: string, options?: EnsureParsedOptions): Promise<BookCacheIndex>;
	invalidate(docKey: string): Promise<void>;
}

export interface SourceFormatProcessor {
	readonly formatId: string;
	readonly extensions: string[];
	canProcess(path: string): boolean;
	parseToBookIndex(sourcePath: string): Promise<BookCacheIndex>;
}

export interface OpenReaderRequest {
	sourcePath: string;
	sourceKind: SourceKind;
	initialPosition?: BookPosition | NotePosition;
	playbackMode?: PlaybackMode;
}

export interface ReaderGate {
	open(request: OpenReaderRequest): Promise<void>;
	close(): void;
	isOpen(): boolean;
	getActiveSourcePath(): string | null;
}

export interface ReadingState {
	sourcePath: string;
	sourceKind: SourceKind;
	title: string;
	author?: string;
	folder: string;
	sourceChecksum: string;
	lastOpenedAt: string;
	pinned: boolean;
	pinnedAt?: string;
	status: ReadingStatus;
	playbackMode: PlaybackMode;
	position: BookPosition | NotePosition;
	progressPercent: number;
	preferredProcessingMode?: 'sections' | 'single_story';
}

export interface ReadingStateFile {
	lastGlobalSourcePath: string;
	sources: Record<string, ReadingState>;
}

export interface ReadingStateStore {
	load(): Promise<ReadingStateFile>;
	get(sourcePath: string): ReadingState | undefined;
	upsert(state: ReadingState): Promise<void>;
	setLastGlobal(sourcePath: string): Promise<void>;
	flush(): Promise<void>;
	onChanged(callback: () => void): () => void;
}

export interface EpubVaultEntry {
	sourcePath: string;
	title: string;
	folder: string;
}

export interface EpubVaultIndex {
	getAll(): EpubVaultEntry[];
	get(sourcePath: string): EpubVaultEntry | undefined;
	refresh(): void;
	onChanged(callback: () => void): () => void;
}

export type EventBusEventMap = {
	'reading-state-changed': { sourcePath: string };
	'reader-opened': { sourcePath: string; sourceKind: SourceKind };
	'reader-closed': { sourcePath: string };
	'book-cache-updated': { docKey: string; sourcePath: string };
	'epub-index-changed': Record<string, never>;
};

export type EventBusEventName = keyof EventBusEventMap;
