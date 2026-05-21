import type { BookCacheIndex, BookPosition, NotePosition } from '../types/m2Contracts';
import type { ReaderTabId } from './readerShell/readerTabDock';

export type SpeedReaderOpen =
	| { kind: 'legacy'; text: string; startOffset?: number }
	| {
			kind: 'structured';
			sourcePath: string;
			text: string;
			checksum: string;
			startOffset?: number;
			sectionIndex?: number;
			tokenIndex?: number;
			resumePosition?: NotePosition;
			preferredProcessingMode?: 'sections' | 'single_story';
	  }
	| {
			kind: 'book';
			sourcePath: string;
			bookIndex: BookCacheIndex;
			initialPosition?: BookPosition;
			sectionIndex?: number;
			tokenIndex?: number;
	  }
	| { kind: 'preferences'; initialTab?: ReaderTabId };
