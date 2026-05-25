import type { BookmarkEntry } from '../../bookmarks/parseBookmarkEntries';
import type { BookmarkReaderContext, BookmarkService } from '../../bookmarks/bookmarkService';
import type { SpeedReaderAiModal } from '../../speedReaderAiModal';
import type { PlaybackLoadKind } from '../../ui/structuredReaderSession';

export interface ReaderBookmarkHandles {
	createBookmark: () => void | Promise<void>;
	openBookmarksTab: () => void | Promise<void>;
	seekToBookmarkEntry: (entry: BookmarkEntry) => boolean;
	batchBookmarkAtEntries: (entryIndices: number[]) => Promise<void>;
	openBookmarkMarkdownInObsidian: () => void | Promise<void>;
	reloadBookmarkEntries: () => Promise<BookmarkEntry[]>;
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
		openBookmarksTab: async () => {
			const entries = await bookmarkService.loadBookmarkEntries(buildBookmarkContext(modal));
			modal.showBookmarksTab(entries);
		},
		seekToBookmarkEntry: (entry) =>
			bookmarkService.seekToBookmarkEntry(buildBookmarkContext(modal), entry),
		batchBookmarkAtEntries: async (entryIndices) => {
			const ctx = buildBookmarkContext(modal);
			const entries = await bookmarkService.loadBookmarkEntries(ctx);
			const unique = [...new Set(entryIndices)];
			for (const entryIndex of unique) {
				const entry = entries[entryIndex];
				if (!entry) {
					continue;
				}
				bookmarkService.seekToBookmarkEntry(ctx, entry);
				await bookmarkService.createBookmark(ctx);
			}
			const refreshed = await bookmarkService.loadBookmarkEntries(buildBookmarkContext(modal));
			modal.showBookmarksTab(refreshed);
		},
		openBookmarkMarkdownInObsidian: () =>
			bookmarkService.openBookmarkMarkdownInObsidian(buildBookmarkContext(modal)),
		reloadBookmarkEntries: () => bookmarkService.loadBookmarkEntries(buildBookmarkContext(modal))
	};

	modal.setBookmarkHandlers(handles);
	modal.refreshControlsBar();
}
