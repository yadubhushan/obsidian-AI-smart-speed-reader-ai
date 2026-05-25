import type { BookmarkContextLine } from '../../bookmarks/bookmarkContextLines';
import type { BookmarkReaderContext, BookmarkService } from '../../bookmarks/bookmarkService';
import type { BookmarkEntry } from '../../bookmarks/parseBookmarkEntries';
import type { SpeedReaderAiModal } from '../../speedReaderAiModal';
import type { PlaybackLoadKind } from '../../ui/structuredReaderSession';

export interface ReaderBookmarkHandles {
	createBookmark: () => void | Promise<void>;
	openBookmarksTab: () => void | Promise<void>;
	createFromSelection: (
		lineIndices: number[],
		lines: BookmarkContextLine[]
	) => Promise<void>;
	loadBookmarkEntries: () => Promise<BookmarkEntry[]>;
	removeBookmarkForLine: (lineIndex: number, lines: BookmarkContextLine[]) => Promise<boolean>;
	openBookmarkMarkdownInObsidian: () => void | Promise<void>;
}

export interface AttachReaderBookmarksDeps {
	modal: SpeedReaderAiModal;
	bookmarkService: BookmarkService;
}

function buildBookmarkContext(modal: SpeedReaderAiModal): BookmarkReaderContext {
	const readerOpen = modal.getReaderOpen();
	const sourcePath =
		readerOpen.kind === 'structured' || readerOpen.kind === 'book'
			? readerOpen.sourcePath
			: null;

	return {
		readerOpen,
		engine: modal.getEngine(),
		readerState: modal.getReaderState(),
		sourcePath,
		bookIndex: readerOpen.kind === 'book' ? readerOpen.bookIndex : undefined,
		session: modal.getStructuredSession(),
		onNoteReloaded: (kind: PlaybackLoadKind) => modal.notifyPlaybackReloaded(kind)
	};
}

export function attachReaderBookmarks(deps: AttachReaderBookmarksDeps): void {
	const { modal, bookmarkService } = deps;

	if (deps.modal.getReaderOpen().kind === 'legacy') {
		return;
	}

	const handles: ReaderBookmarkHandles = {
		createBookmark: () => bookmarkService.createBookmark(buildBookmarkContext(modal)),
		openBookmarksTab: () => {
			modal.showBookmarkPicker();
		},
		createFromSelection: (lineIndices, lines) =>
			bookmarkService.createBookmarksFromSelection(
				buildBookmarkContext(modal),
				lineIndices,
				lines
			),
		loadBookmarkEntries: () => bookmarkService.loadBookmarkEntries(buildBookmarkContext(modal)),
		removeBookmarkForLine: (lineIndex, lines) =>
			bookmarkService.removeBookmarkForLine(buildBookmarkContext(modal), lineIndex, lines),
		openBookmarkMarkdownInObsidian: () =>
			bookmarkService.openBookmarkMarkdownInObsidian(buildBookmarkContext(modal))
	};

	modal.setBookmarkHandlers(handles);
	modal.refreshControlsBar();
}
