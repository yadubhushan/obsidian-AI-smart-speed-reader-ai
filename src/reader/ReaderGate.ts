import { Notice, type App } from 'obsidian';
import type { EventBus } from '../services/eventBus';
import { openBookReader } from './openBookReader';
import { openNoteReader } from './openNoteReader';
import { SpeedReaderAiModal } from '../speedReaderAiModal';
import type { ManifestStore } from '../store/ManifestStore';
import type {
	BookCacheStore,
	OpenReaderRequest,
	ReaderGate,
	ReadingStateStore
} from '../types/m2Contracts';
import type { SpeedReaderAiSettings } from '../types';
import type { PreparePromptSet } from '../llm/promptCatalog';
import type { PluginServices } from '../services/serviceRegistry';
import type { PlaybackLoadKind } from '../ui/structuredReaderSession';

export interface ReaderGateDeps {
	app: App;
	eventBus: EventBus;
	bookCacheStore: BookCacheStore;
	readingStateStore: ReadingStateStore;
	services: PluginServices;
	getSettings: () => SpeedReaderAiSettings;
	onSettingsChange: (settings: SpeedReaderAiSettings) => void;
	preparePrompts: PreparePromptSet;
	getManifestStore: () => ManifestStore;
	onPrepareStatusChange?: () => void;
}

export class ReaderGateImpl implements ReaderGate {
	private activeModal: SpeedReaderAiModal | null = null;
	private activeSourcePath: string | null = null;

	constructor(private readonly deps: ReaderGateDeps) {}

	async open(request: OpenReaderRequest): Promise<void> {
		if (request.sourceKind !== 'book' && request.sourceKind !== 'note') {
			return;
		}

		if (this.activeModal && this.activeSourcePath === request.sourcePath) {
			this.activeModal.contentEl.focus();
			return;
		}

		const blockedBook = await this.resolveBlockingBook(request);
		if (blockedBook) {
			if (this.activeSourcePath === blockedBook.sourcePath && this.activeModal) {
				this.activeModal.contentEl.focus();
			}
			new Notice(
				`Finish "${blockedBook.title}" first (${Math.round(
					blockedBook.progressPercent
				)}%) or disable the setting in Speed Reader AI.`
			);
			return;
		}

		if (this.activeModal) {
			this.close();
		}

		const onClose = (sourcePath: string) => this.handleModalClosed(sourcePath);

		if (request.sourceKind === 'note') {
			this.activeModal = await openNoteReader({
				app: this.deps.app,
				request,
				readingStateStore: this.deps.readingStateStore,
				eventBus: this.deps.eventBus,
				settings: this.deps.getSettings(),
				getSettings: this.deps.getSettings,
				onSettingsChange: this.deps.onSettingsChange,
				preparePrompts: this.deps.preparePrompts,
				getManifestStore: this.deps.getManifestStore,
				services: this.deps.services,
				onClose,
				onPrepareStatusChange: this.deps.onPrepareStatusChange
			});
		} else {
			this.activeModal = await openBookReader({
				app: this.deps.app,
				request,
				bookCacheStore: this.deps.bookCacheStore,
				readingStateStore: this.deps.readingStateStore,
				eventBus: this.deps.eventBus,
				settings: this.deps.getSettings(),
				getSettings: this.deps.getSettings,
				onSettingsChange: this.deps.onSettingsChange,
				preparePrompts: this.deps.preparePrompts,
				services: this.deps.services,
				onClose
			});
		}

		this.activeSourcePath = request.sourcePath;
	}

	close(): void {
		if (!this.activeModal) {
			return;
		}
		this.activeModal.close();
	}

	isOpen(): boolean {
		return this.activeModal !== null;
	}

	getActiveSourcePath(): string | null {
		return this.activeSourcePath;
	}

	getActiveModal(): SpeedReaderAiModal | null {
		return this.activeModal;
	}

	async createBookmark(): Promise<void> {
		const modal = this.activeModal;
		if (!modal || modal.getReaderOpen().kind === 'legacy') {
			return;
		}
		await this.deps.services.bookmarkService.createBookmark(
			this.bookmarkContextFromModal(modal)
		);
	}

	async openBookmarkTarget(): Promise<void> {
		const modal = this.activeModal;
		if (!modal || modal.getReaderOpen().kind === 'legacy') {
			return;
		}
		await modal.showBookmarkPickerFromService();
	}

	private bookmarkContextFromModal(modal: SpeedReaderAiModal) {
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

	private handleModalClosed(sourcePath: string): void {
		if (this.activeSourcePath === sourcePath) {
			this.activeModal = null;
			this.activeSourcePath = null;
		}
		this.deps.eventBus.emit('reader-closed', { sourcePath });
	}

	private async resolveBlockingBook(request: OpenReaderRequest) {
		if (
			request.sourceKind !== 'book' ||
			!this.deps.getSettings().reader.requireCompletionBeforeNewBook
		) {
			return null;
		}

		await this.deps.readingStateStore.reloadFromDisk();
		const file = await this.deps.readingStateStore.load();
		const blockingStates = Object.values(file.sources)
			.filter(
				(state) =>
					state.sourceKind === 'book' &&
					state.sourcePath !== request.sourcePath &&
					state.status === 'in_progress'
			)
			.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));

		return blockingStates[0] ?? null;
	}
}

export function createReaderGate(deps: ReaderGateDeps): ReaderGateImpl {
	return new ReaderGateImpl(deps);
}
