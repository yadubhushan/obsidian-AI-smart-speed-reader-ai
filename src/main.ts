import { Editor, MarkdownView, Menu, Notice, Plugin } from 'obsidian';
import { initAI } from '@obsidian-ai-providers/sdk';
import { initCursorCliDesktopSupport } from './llm/cursorCliDesktopBridge';
import { noteContentChecksum } from './crypto-checksum';
import { activeVersionStatus } from './store/cacheIndexUtils';
import { registerFeature1 } from './features/feature1/registerFeature1';
import {
	attachNoteReadingSession,
	prepareNoteOpenState,
	registerFeature2
} from './features/feature2/registerFeature2';
import { registerFeature3A } from './features/feature3a/registerFeature3A';
import { registerFeature3B } from './features/feature3b/registerFeature3B';
import { registerFeature4, wireReaderBookmarks } from './features/feature4/registerFeature4';
import { registerWordLookup, wireReaderWordLookup } from './features/word-lookup/registerWordLookup';
import { DEFAULT_SETTINGS, SpeedReaderAiSettings, SpeedReaderAiSettingTab } from './settings';
import { createPluginServices, type PluginServices } from './services/serviceRegistry';
import { SpeedReaderAiModal } from './speedReaderAiModal';
import { validateSettings } from './services/settingsValidator';
import {
	createDefaultLlmModelCatalog,
	ensureLlmModelsConfigFile,
	loadLlmModelCatalogFromPath,
	migrateLlmModelsConfigIfNeeded,
	type LlmModelCatalog
} from './llm/llmModelCatalog';
import {
	ensurePreparePromptFiles,
	loadPreparePromptSet,
	pluginPromptsDirPath,
	type PreparePromptSet
} from './llm/promptCatalog';
import { ManifestStore } from './store/ManifestStore';
import { migrateSpeedReaderVaultData } from './store/migrateSpeedReaderVaultData';
import { listReadCacheDocKeys, readCacheBasePath } from './store/readCachePaths';
import { createVaultManifestAdapter } from './store/vaultManifestAdapter';
import type { SpeedReaderOpen } from './ui/speedReaderOpen';
import type { ReaderTabId } from './ui/readerShell/readerTabDock';
import type { NotePosition } from './types/m2Contracts';

export default class SpeedReaderAiPlugin extends Plugin {
	settings!: SpeedReaderAiSettings;
	llmModelCatalog: LlmModelCatalog = createDefaultLlmModelCatalog();
	llmModelsConfigPath = '';
	preparePrompts!: PreparePromptSet;
	private preparePromptsDirPath = '';
	private manifestStore: ManifestStore | null = null;
	private prepareStatusBarEl: HTMLElement | null = null;
	private services: PluginServices | null = null;

	async onload() {
		initAI(this.app, this, async () => undefined, { disableFallback: true });
		await initCursorCliDesktopSupport();
		this.llmModelsConfigPath = await migrateLlmModelsConfigIfNeeded(
			this.app.vault.adapter,
			this.app.vault.configDir,
			this.manifest.id
		);
		await ensureLlmModelsConfigFile(
			this.app.vault.adapter,
			this.llmModelsConfigPath
		);
		this.llmModelCatalog = await loadLlmModelCatalogFromPath(
			this.app.vault.adapter,
			this.llmModelsConfigPath
		);
		this.preparePromptsDirPath = pluginPromptsDirPath(
			this.app.vault.configDir,
			this.manifest.id
		);
		await ensurePreparePromptFiles(
			this.app.vault.adapter,
			this.preparePromptsDirPath
		);
		this.preparePrompts = await loadPreparePromptSet(
			this.app.vault.adapter,
			this.preparePromptsDirPath
		);
		await this.loadSettings();
		await migrateSpeedReaderVaultData(
			this.app.vault.adapter,
			this.app.vault.configDir
		);
		this.services = createPluginServices(this);
		registerFeature1(this, this.services);
		registerFeature2(this, this.services);
		registerFeature3A(this, this.services);
		registerFeature3B(this, this.services);
		registerFeature4(this, this.services);
		registerWordLookup(this);

		this.addRibbonIcon('book-open', 'Speed read current note', () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				this.startSpeedReading(view);
			} else {
				new Notice('Open a note first');
			}
		});

		this.addCommand({
			id: 'start-speed-reading',
			name: 'Start speed reading',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						this.startSpeedReading(markdownView);
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'speed-read-selection',
			name: 'Speed read selected text',
			editorCheckCallback: (checking, editor) => {
				const selection = editor.getSelection();
				if (selection && selection.length > 0) {
					if (!checking) {
						void this.openSpeedReader({ kind: 'legacy', text: selection });
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'read-entire-note',
			name: 'Read entire note from cursor',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						this.startSpeedReading(markdownView, true);
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'open-speed-reader-preferences',
			name: 'Open speed reader preferences',
			callback: () => {
				void this.openReaderPreferences('settings');
			}
		});

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
				const selection = editor.getSelection();
				if (!selection || selection.trim().length === 0) {
					return;
				}

				menu.addItem((item) => {
					item
						.setTitle('Read with speed reader')
						.setIcon('book-open')
						.onClick(() => {
							void this.openSpeedReader({ kind: 'legacy', text: selection });
						});
				});
			})
		);

		this.addSettingTab(new SpeedReaderAiSettingTab(this.app, this));

		this.prepareStatusBarEl = this.addStatusBarItem();
		this.prepareStatusBarEl.addClass('speed-reader-ai-statusbar');
		this.prepareStatusBarEl.addClass('is-hidden');
		void this.refreshPrepareStatusBar();

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				void this.refreshPrepareStatusBar();
			})
		);
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				void this.refreshPrepareStatusBar();
			})
		);
	}

	onunload() {
		this.prepareStatusBarEl = null;
		this.services = null;
	}

	onPrepareStatusChange(): void {
		void this.refreshPrepareStatusBar();
	}

	getServices(): PluginServices {
		if (!this.services) {
			this.services = createPluginServices(this);
		}
		return this.services;
	}

	getReadCacheBasePath(): string {
		return readCacheBasePath();
	}

	getManifestStore(): ManifestStore {
		if (!this.manifestStore) {
			const base = this.getReadCacheBasePath();
			const vaultAdapter = this.app.vault.adapter;
			const adapter = createVaultManifestAdapter(vaultAdapter, base);
			this.manifestStore = new ManifestStore(adapter, '', {
				vaultAdapter,
				basePath: base
			});
		}
		return this.manifestStore;
	}

	async countCachedDocuments(): Promise<number> {
		const keys = await listReadCacheDocKeys(
			this.app.vault.adapter,
			this.getReadCacheBasePath()
		);
		return keys.length;
	}

	async clearAllReadCache(): Promise<number> {
		const count = await this.getManifestStore().clearAllDocumentCache();
		await this.refreshPrepareStatusBar();
		return count;
	}

	async reloadLlmModelCatalog(): Promise<void> {
		this.llmModelCatalog = await loadLlmModelCatalogFromPath(
			this.app.vault.adapter,
			this.llmModelsConfigPath
		);
		this.settings.ai.llmModel = this.llmModelCatalog.normalize(this.settings.ai.llmModel);
		await this.saveSettings();
	}

	async loadSettings() {
		const raw = await this.loadData() as Partial<SpeedReaderAiSettings> | null;
		this.settings = validateSettings(Object.assign({}, DEFAULT_SETTINGS, raw), this.llmModelCatalog);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private startSpeedReading(view: MarkdownView, fromCursor = false) {
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
			this.settings.bookmarks.noteBookmarkSectionHeading
		);
		await this.openSpeedReader({
			kind: 'structured',
			sourcePath,
			text,
			checksum,
			startOffset
		});
	}

	async openReaderPreferences(initialTab: ReaderTabId = 'settings') {
		const modal = new SpeedReaderAiModal(
			this.app,
			{ kind: 'preferences', initialTab },
			{ ...this.settings },
			(newSettings) => {
				this.settings = validateSettings(newSettings, this.llmModelCatalog);
				void this.saveSettings();
			},
			undefined,
			undefined,
			undefined,
			undefined,
			this.llmModelCatalog
		);
		modal.open();
	}

	private async openSpeedReader(open: SpeedReaderOpen) {
		const services = this.getServices();
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

		const modal = new SpeedReaderAiModal(
			this.app,
			readerOpen,
			{ ...this.settings },
			(newSettings) => {
				this.settings = validateSettings(newSettings, this.llmModelCatalog);
				void this.saveSettings();
			},
			readerOpen.kind === 'structured' ? this.getManifestStore() : undefined,
			this.preparePrompts,
			readerOpen.kind === 'structured'
				? () => this.refreshPrepareStatusBar()
				: undefined,
			sourcePath
				? () => {
						services.eventBus.emit('reader-closed', { sourcePath });
					}
				: undefined
		);

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

		wireReaderWordLookup(modal, () => ({
			dictionary: {
				enableWordLookup: this.settings.dictionary.enableWordLookup,
				dictionaryCacheEnabled: this.settings.dictionary.dictionaryCacheEnabled
			}
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

		void this.refreshPrepareStatusBar();
	}

	async refreshPrepareStatusBar(): Promise<void> {
		const el = this.prepareStatusBarEl;
		if (!el) return;

		el.removeClass('is-ready', 'is-stale', 'is-hidden');
		el.empty();

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		if (!file || file.extension !== 'md') {
			el.addClass('is-hidden');
			return;
		}

		const store = this.getManifestStore();
		const index = await store.getDocumentIndex(file.path);
		if (!index) {
			el.addClass('is-hidden');
			return;
		}

		const modeStatus = activeVersionStatus(index);

		if (modeStatus === 'ready') {
			el.addClass('is-ready');
			el.setText('⚡ AI Ready');
			return;
		}

		if (modeStatus === 'stale') {
			el.addClass('is-stale');
			el.setText('⚠ AI Stale');
			return;
		}

		el.addClass('is-hidden');
	}
}
