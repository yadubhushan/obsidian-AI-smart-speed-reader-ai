import type { BookmarkReaderContext, BookmarkService } from '../../bookmarks/bookmarkService';
import type { SpeedReaderAiModal } from '../../speedReaderAiModal';

export interface ReaderBookmarkHandles {
	createBookmark: () => void | Promise<void>;
	openBookmarkTarget: () => void | Promise<void>;
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
		session: modal.getStructuredSession()
	};
}

export function attachReaderBookmarks(deps: AttachReaderBookmarksDeps): void {
	const { modal, bookmarkService } = deps;

	if (deps.modal.getReaderOpen().kind === 'legacy') {
		return;
	}

	const handles: ReaderBookmarkHandles = {
		createBookmark: () => bookmarkService.createBookmark(buildBookmarkContext(modal)),
		openBookmarkTarget: () => bookmarkService.openBookmarkTarget(buildBookmarkContext(modal))
	};

	modal.setBookmarkHandlers(handles);
	modal.refreshControlsBar();
}
