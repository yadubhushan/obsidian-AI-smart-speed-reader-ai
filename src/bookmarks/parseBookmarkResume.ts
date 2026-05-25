import type { BookPosition, NotePosition } from '../types/m2Contracts';

export type BookmarkResumeTarget =
	| { kind: 'book'; sourcePath: string; position: BookPosition }
	| { kind: 'note'; sourcePath: string; position: NotePosition };

const BOOK_URI_RE =
	/^speed-reader:\/\/book\/([^?]+)\?chapter=([^&]+)&word=(\d+)$/i;
const NOTE_URI_RE =
	/^speed-reader:\/\/note\/([^?]+)\?section=([^&]+)&word=(\d+)$/i;

const BOOK_POSITION_RE = /^chapter\s+(\S+)\s+(?:·\s+)?word\s+(\d+)$/i;
const NOTE_POSITION_RE = /^section\s+(\S+)\s+(?:·\s+)?word\s+(\d+)$/i;

function decodeUriPath(encoded: string): string {
	try {
		return decodeURIComponent(encoded);
	} catch {
		return encoded;
	}
}

/** Parse a speed-reader resume URI into a bookmark seek target. */
export function parseBookmarkResumeUri(uri: string): BookmarkResumeTarget | null {
	const trimmed = uri.trim();
	const bookMatch = trimmed.match(BOOK_URI_RE);
	if (bookMatch) {
		return {
			kind: 'book',
			sourcePath: decodeUriPath(bookMatch[1] ?? ''),
			position: {
				chapterId: decodeURIComponent(bookMatch[2] ?? ''),
				wordIndex: Number.parseInt(bookMatch[3] ?? '0', 10)
			}
		};
	}

	const noteMatch = trimmed.match(NOTE_URI_RE);
	if (noteMatch) {
		return {
			kind: 'note',
			sourcePath: decodeUriPath(noteMatch[1] ?? ''),
			position: {
				sectionId: decodeURIComponent(noteMatch[2] ?? ''),
				wordIndex: Number.parseInt(noteMatch[3] ?? '0', 10)
			}
		};
	}

	return null;
}

/** Parse a Position: metadata line when no resume URI is present. */
export function parseBookmarkPositionLine(
	line: string,
	expectedKind: 'book' | 'note'
): BookPosition | NotePosition | null {
	const trimmed = line.trim();
	if (expectedKind === 'book') {
		const match = trimmed.match(BOOK_POSITION_RE);
		if (!match) {
			return null;
		}
		return {
			chapterId: match[1] ?? '',
			wordIndex: Number.parseInt(match[2] ?? '0', 10)
		};
	}

	const match = trimmed.match(NOTE_POSITION_RE);
	if (!match) {
		return null;
	}
	return {
		sectionId: match[1] ?? '',
		wordIndex: Number.parseInt(match[2] ?? '0', 10)
	};
}
