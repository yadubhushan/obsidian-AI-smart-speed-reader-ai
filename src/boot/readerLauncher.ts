import { MarkdownView, Notice, type App } from 'obsidian';
import { noteContentChecksum } from '../crypto-checksum';
import {
	attachNoteReadingSession,
	prepareNoteOpenState
} from '../features/feature2/registerFeature2';
import { wireReaderBookmarks } from '../features/feature4/registerFeature4';
import { wireReaderWordLookup } from '../features/word-lookup/registerWordLookup';
import type { SpeedReaderAiSettings } from '../settings';
import type { PluginServices } from '../services/serviceRegistry';
import { SpeedReaderAiModal } from '../speedReaderAiModal';
import type { PreparePromptSet } from '../llm/promptCatalog';
import type { ManifestStore } from '../store/ManifestStore';
import type { SpeedReaderOpen } from '../ui/speedReaderOpen';
import type { ReaderTabId } from '../ui/readerShell/readerTabDock';
import type { NotePosition } from '../types/m2Contracts';
import type { ReaderCommandHost } from './registerReaderCommands';

export interface ReaderLauncherDeps {
	app: App;
	getSettings(): SpeedReaderAiSettings;
	/** Single owner of the validate-then-save settings flow. */
	persistSettings(next: SpeedReaderAiSettings): void;
	getServices(): PluginServices;
	getManifestStore(): ManifestStore;
	getPreparePrompts(): PreparePromptSet;
	refreshPrepareStatusBar(): Promise<void>;
}

/**
 * Orchestrates opening the reader modal: resume-state resolution, modal
 * construction, and session/bookmark/word-lookup wiring.
 */
export class ReaderLauncher implements ReaderCommandHost {
	constructor(private readonly deps: ReaderLauncherDeps) {}

	startSpeedReading(view: MarkdownView, fromCursor = false): void {
		const editor = view.editor;
		let text = editor.getSelection();
		let startOffset = 0;

		if (!text || text.length === 0) {
			text = editor.getValue();
			startOffset = fromCursor ? editor.posToOffset(editor.getCursor()) : 0;
		}

		if (!text || text.trim().length === 0) {
			new Notice('No text to speed read');
			return;
		}

		const hasSelection = (editor.getSelection()?.length ?? 0) > 0;
		if (!hasSelection && view.file) {
			void this.openStructuredNote(view.file.path, text, startOffset);
			return;
		}

		void this.openSpeedReader({ kind: 'legacy', text, startOffset });
	}

	private async openStructuredNote(sourcePath: string, text: string, startOffset: number) {
		const checksum = await noteContentChecksum(
			text,
			this.deps.getSettings().bookmarks.noteBookmarkSectionHeading
		);
		await this.openSpeedReader({
			kind: 'structured',
			sourcePath,
			text,
			checksum,
			startOffset
		});
	}

	async openReaderPreferences(initialTab: ReaderTabId = 'settings'): Promise<void> {
		const modal = new SpeedReaderAiModal(this.deps.app, {
			readerOpen: { kind: 'preferences', initialTab },
			settings: { ...this.deps.getSettings() },
			onSettingsChange: (newSettings) => {
				this.deps.persistSettings(newSettings);
			}
		});
		modal.open();
	}

	async openSpeedReader(open: SpeedReaderOpen): Promise<void> {
		const services = this.deps.getServices();
		let readerOpen = open;
		let existingNoteState: ReturnType<typeof services.readingStateStore.get> | undefined;
		let noteChecksumReset = false;

		if (open.kind === 'structured') {
			const prepared = await prepareNoteOpenState({
				sourcePath: open.sourcePath,
				sourceChecksum: open.checksum,
				services
			});
			existingNoteState = prepared.existingState;
			noteChecksumReset = prepared.checksumReset;

			if (noteChecksumReset) {
				new Notice('Book updated — starting from beginning');
			}

			const resumePosition =
				!noteChecksumReset && existingNoteState?.sourceKind === 'note'
					? (existingNoteState.position as NotePosition)
					: undefined;

			readerOpen = {
				...open,
				startOffset: resumePosition ? undefined : open.startOffset,
				resumePosition,
				preferredProcessingMode: existingNoteState?.preferredProcessingMode,
				preferredAiVersionId: existingNoteState?.preferredAiVersionId
			};
		}

		const sourcePath =
			readerOpen.kind === 'structured' || readerOpen.kind === 'book' ? readerOpen.sourcePath : null;

		const modal = new SpeedReaderAiModal(this.deps.app, {
			readerOpen,
			settings: { ...this.deps.getSettings() },
			onSettingsChange: (newSettings) => {
				this.deps.persistSettings(newSettings);
			},
			manifestStore: readerOpen.kind === 'structured' ? this.deps.getManifestStore() : undefined,
			preparePrompts: this.deps.getPreparePrompts(),
			onCacheCleared:
				readerOpen.kind === 'structured'
					? () => this.deps.refreshPrepareStatusBar()
					: undefined,
			onReaderClose: sourcePath
				? () => {
						services.eventBus.emit('reader-closed', { sourcePath });
					}
				: undefined
		});

		if (readerOpen.kind === 'structured') {
			const hooks = attachNoteReadingSession({
				modal,
				engine: modal.getEngine(),
				sourcePath: readerOpen.sourcePath,
				sourceChecksum: readerOpen.checksum,
				preferredProcessingMode: existingNoteState?.preferredProcessingMode,
				existingState: noteChecksumReset ? undefined : existingNoteState,
				initialPlaybackMode: existingNoteState?.playbackMode,
				services
			});
			modal.setSessionHooks(hooks);
		}

		modal.open();

		wireReaderWordLookup(this.deps.app, modal, () => ({
			dictionary: this.deps.getSettings().dictionary
		}));

		if (readerOpen.kind === 'structured' || readerOpen.kind === 'book') {
			wireReaderBookmarks(modal, services);
		}

		if (sourcePath) {
			services.eventBus.emit('reader-opened', {
				sourcePath,
				sourceKind: readerOpen.kind === 'book' ? 'book' : 'note'
			});
		}

		void this.deps.refreshPrepareStatusBar();
	}
}
