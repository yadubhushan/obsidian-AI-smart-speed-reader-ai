import type SpeedReaderAiPlugin from '../../main';
import { createBookmarkService } from '../../bookmarks/bookmarkService';
import type { PluginServices } from '../../services/serviceRegistry';
import { attachReaderBookmarks } from './attachReaderBookmarks';
import type { SpeedReaderAiModal } from '../../speedReaderAiModal';
import type { PlaybackLoadKind } from '../../ui/structuredReaderSession';

export function registerFeature4(plugin: SpeedReaderAiPlugin, services: PluginServices): void {
	const bookmarkService = services.bookmarkService;

	plugin.addCommand({
		id: 'speed-reader-create-bookmark',
		name: 'Create bookmark (B)',
		checkCallback: (checking) => {
			const modal = services.readerGate.getActiveModal();
			if (!modal || modal.getReaderOpen().kind === 'legacy') {
				return false;
			}
			if (!checking) {
				void bookmarkService.createBookmark(buildContextFromModal(modal));
			}
			return true;
		}
	});

	plugin.addCommand({
		id: 'speed-reader-open-bookmark',
		name: 'Open saved bookmarks (Shift+B)',
		checkCallback: (checking) => {
			const modal = services.readerGate.getActiveModal();
			if (!modal || modal.getReaderOpen().kind === 'legacy') {
				return false;
			}
			if (!checking) {
				void modal.showBookmarksTabFromService();
			}
			return true;
		}
	});
}

export function wireReaderBookmarks(
	modal: SpeedReaderAiModal,
	services: PluginServices
): void {
	attachReaderBookmarks({
		modal,
		bookmarkService: services.bookmarkService
	});
}

function buildContextFromModal(modal: SpeedReaderAiModal) {
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
