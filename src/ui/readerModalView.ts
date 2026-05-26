import { App, Modal, Notice } from 'obsidian';
import { RSVPEngine } from '../engine/rsvpEngine';
import { isLinePlaybackMode, getPlaybackModeLabel } from '../engine/playbackMode';
import { tokenDisplayLabel } from '../engine/manifestPlayback';
import { SettingsBackedLlmClient, describeActiveLlmBackend } from '../llm/createLlmClient';
import { getAiProvidersApi } from '../llm/aiProvidersBridge';
import type { LlmModelCatalog } from '../llm/llmModelCatalog';
import { createDefaultLlmModelCatalog } from '../llm/llmModelCatalog';
import type { ManifestStore } from '../store/ManifestStore';
import { DEFAULT_SETTINGS, HeadingInfo, PlaybackMode, ReaderState, SpeedReaderAiSettings, WordData } from '../types';
import type { PreparePromptSet } from '../llm/promptCatalog';
import type { ProcessingModeId } from '../types/processedDocument';
import { mountModePicker, type ModePickerHandle } from './modePicker';
import { mountVersionPicker, type VersionPickerHandle } from './versionPicker';
import { mountPrepareControls, type PrepareControlsHandle } from './prepareControls';
import { mountChapterNavControls, type ChapterNavControlsHandle } from './chapterNavControls';
import { mountSectionNavControls, type SectionNavControlsHandle } from './sectionNavControls';
import {
	applyNoteResumePosition,
	computeDocumentProgressFromEngine
} from '../reader/readingProgress';
import type { SourceKind } from '../types/m2Contracts';
import { splitWordForOrpDisplay } from '../services/textParser';
import type { SpeedReaderOpen } from './speedReaderOpen';
import { StructuredReaderSession, type PlaybackLoadKind } from './structuredReaderSession';
import { bookIndexToProcessedDocument } from '../formats/bookIndexToProcessedDocument';
import { bookCacheCoverPath } from '../store/bookCachePaths';
import type { ReaderSessionHooks } from '../reader/readingProgressTracker';
import type { ReaderBookmarkHandles } from '../features/feature4/attachReaderBookmarks';
import {
	buildBookmarkContextLines,
	matchBookmarkedLineIndices,
	type BookmarkContextLine
} from '../bookmarks/bookmarkContextLines';
import type { ReaderWordLookupHandles } from '../features/word-lookup/attachReaderWordLookup';
import type { DictionaryLookupOutcome } from '../dictionary/dictionaryTypes';
import type { DictionarySaveButtonState } from './dictionaryFooter';
import { mountDictionaryOverlay, type DictionaryOverlayHandle } from './dictionaryOverlay';
import { applyReaderThemeToElement, readerFontFamily } from './readerShell/readerThemes';
import { mountReaderHeader, type ReaderHeaderHandle } from './readerShell/readerHeader';
import { mountReaderControlBar, type ReaderControlBarHandle } from './readerShell/readerControlBar';
import { mountContextLine, type ContextLineHandle } from './readerShell/contextLine';
import {
	mountReaderTabDock,
	type ReaderTabDockHandle,
	type ReaderTabId
} from './readerShell/readerTabDock';
import { mountContentPane, type ContentPaneHandle } from './readerShell/panes/contentPane';
import { mountSettingsPane, type SettingsPaneHandle } from './readerShell/panes/settingsPane';
import { mountShortcutsPane, type ShortcutsPaneHandle } from './readerShell/panes/shortcutsPane';
import { mountAdvancedPane, type AdvancedPaneHandle } from './readerShell/panes/advancedPane';
import { mountBookmarksPane, type BookmarksPaneHandle } from './readerShell/panes/bookmarksPane';
import {
	mountMobileMenuHubPane,
	type MobileMenuHubPaneHandle
} from './readerShell/panes/mobileMenuHubPane';
import { validateSettings } from '../services/settingsValidator';
import {
	applyMobileShellClass,
	isMobileReader,
	mountMobileProgressStrip,
	removeMobileShellClass,
	syncMobilePausedState,
	syncMobilePlayingState,
	syncMobileProgressStrip
} from './readerShell/mobileLayout';
import {
	mountMobileCoachMarks,
	type MobileCoachMarksHandle
} from './readerShell/mobileCoachMarks';
import {
	mountMobileCompactBar,
	type MobileCompactBarHandle
} from './readerShell/mobileCompactBar';
import {
	mountMobileActionBar,
	type MobileActionBarHandle
} from './readerShell/mobileActionBar';
import {
	mountMobileGestures,
	type EdgeSide,
	type MobileGesturesHandle
} from './readerShell/mobileGestures';
import {
	mountMobileBottomSheet,
	type MobileBottomSheetHandle
} from './readerShell/mobileBottomSheet';
import {
	mountMobileDictionarySheet,
	type MobileDictionarySheetHandle
} from './readerShell/mobileDictionarySheet';
import {
	mobileRouteToReaderTab,
	readerTabToMobileRoute,
	syncMobileRouteShell,
	isMobileStackRoute,
	isMobileReadingRoot,
	type MobileRoute
} from './readerShell/mobileNavigation';
import {
	resolveReaderBackAction,
	type ReaderBackAction
} from './readerShell/readerBackNavigation';
import {
	applyDesktopFocusChrome,
	type SidebarSnapshot
} from './readerShell/desktopFocusChrome';

const INTER_SECTION_MS = 5000;
const SECTION_INTRO_MS = 2500;
const FONT_SIZE_STEP = 3;
const MIN_FONT_SIZE = 24;
const MAX_FONT_SIZE = 200;
const PREPARE_OVERLAY_PRIMARY = 'Preparing with AI…';

function formatRemainingTime(milliseconds: number): string {
	const totalSeconds = Math.ceil(milliseconds / 1000);
	if (totalSeconds < 60) {
		return `${totalSeconds}s left`;
	}

	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (seconds === 0) {
		return `${minutes}m left`;
	}

	return `${minutes}m ${seconds}s left`;
}

function headingLabel(heading: HeadingInfo): string {
	return `${'#'.repeat(heading.level)} ${heading.text}`;
}

export class SpeedReaderAiModal extends Modal {
	private readonly readerOpen: SpeedReaderOpen;
	private settings: SpeedReaderAiSettings;
	private readonly onSettingsChange: (settings: SpeedReaderAiSettings) => void;
	private readonly manifestStore?: ManifestStore;
	private readonly preparePrompts?: PreparePromptSet;
	private readonly llmModelCatalog: LlmModelCatalog;
	private readonly onCacheCleared?: () => void | Promise<void>;
	private readonly onReaderClose?: () => void;
	private sessionHooks?: ReaderSessionHooks;
	private bookmarkHandlers: ReaderBookmarkHandles | null = null;
	private wordLookupHandlers: ReaderWordLookupHandles | null = null;
	private dictionaryOverlay: DictionaryOverlayHandle | null = null;
	private mobileDictionarySheet: MobileDictionarySheetHandle | null = null;
	private previousIsPlaying: boolean | null = null;

	private session: StructuredReaderSession | null = null;
	private engine: RSVPEngine;
	private focusMode = false;
	private sidebarSnapshot: SidebarSnapshot | null = null;
	private activeTab: ReaderTabId = 'home';
	private state: ReaderState | null = null;
	private wasPlayingBeforeBlur = false;
	private autoStartTimer: number | null = null;
	private boundVisibilityHandler: () => void;
	private boundBlurHandler: () => void;

	private ownerDoc!: Document;
	private shellEl!: HTMLElement;
	private paneStackEl!: HTMLElement;
	private homePaneEl!: HTMLElement;
	private wordContainer!: HTMLElement;
	private wordDisplayEl!: HTMLElement;
	private header!: ReaderHeaderHandle;
	private controlBar!: ReaderControlBarHandle;
	private contextLine!: ContextLineHandle;
	private tabDock: ReaderTabDockHandle | null = null;
	private mobileCompactBar: MobileCompactBarHandle | null = null;
	private mobileActionBar: MobileActionBarHandle | null = null;
	private mobilePausedStackEl: HTMLElement | null = null;
	private mobileBottomSheet: MobileBottomSheetHandle | null = null;
	private mobileGestures: MobileGesturesHandle | null = null;
	private mobileCoachMarks: MobileCoachMarksHandle | null = null;
	private mobileProgressStripEl: HTMLElement | null = null;
	private mobileMenuOpen = false;
	private mobileDictionaryOpen = false;
	private wasPlayingBeforeDictionary = false;
	private mobileCoachOpen = false;
	private edgeHoldSide: EdgeSide | null = null;
	private edgeScrubTimer: number | null = null;
	private edgeScrubTickCount = 0;
	private skipFlashEl: HTMLElement | null = null;
	private skipFlashTimer: number | null = null;
	private readonly mobileReader = isMobileReader();
	private mobileRoute: MobileRoute = 'reading';
	private mobileRouteStack: MobileRoute[] = ['reading'];
	private contentPane!: ContentPaneHandle;
	private bookmarksPane!: BookmarksPaneHandle;
	private bookmarkContextLines: BookmarkContextLine[] = [];
	private settingsPane!: SettingsPaneHandle;
	private shortcutsPane!: ShortcutsPaneHandle;
	private advancedPane!: AdvancedPaneHandle;
	private mobileMenuHubPane: MobileMenuHubPaneHandle | null = null;
	private modePickerHost!: HTMLElement;
	private versionPickerHost!: HTMLElement;
	private structuredBarEl!: HTMLElement;
	private headingSelectWrapper!: HTMLElement;
	private sectionSelect!: HTMLSelectElement;
	private interSectionOverlayEl: HTMLElement | null = null;
	private prepareOverlayEl: HTMLElement | null = null;
	private prepareOverlaySublineEl: HTMLElement | null = null;
	private interSectionTimer: number | null = null;
	private interSectionCountdownInterval: number | null = null;
	private sectionIntroShownForIndex: number | null = null;
	private skipNextSectionIntro = false;

	private modePicker: ModePickerHandle | null = null;
	private versionPicker: VersionPickerHandle | null = null;
	private prepareControls: PrepareControlsHandle | null = null;
	private sectionNav: SectionNavControlsHandle | null = null;
	private chapterNav: ChapterNavControlsHandle | null = null;
	private coverObjectUrl: string | null = null;
	private readonly bookCacheBase: string;
	constructor(
		app: App,
		readerOpen: SpeedReaderOpen,
		settings: SpeedReaderAiSettings,
		onSettingsChange: (settings: SpeedReaderAiSettings) => void,
		manifestStore?: ManifestStore,
		preparePrompts?: PreparePromptSet,
		onCacheCleared?: () => void | Promise<void>,
		onReaderClose?: () => void,
		llmModelCatalog: LlmModelCatalog = createDefaultLlmModelCatalog(),
		bookCacheBase = ''
	) {
		super(app);
		this.bookCacheBase = bookCacheBase;
		this.readerOpen = readerOpen;
		this.settings = settings;
		this.onSettingsChange = onSettingsChange;
		this.manifestStore = manifestStore;
		this.preparePrompts = preparePrompts;
		this.onCacheCleared = onCacheCleared;
		this.onReaderClose = onReaderClose;
		this.llmModelCatalog = llmModelCatalog;
		if (readerOpen.kind !== 'preferences' && !preparePrompts) {
			throw new Error('SpeedReaderAiModal requires preparePrompts');
		}
		if (readerOpen.kind === 'preferences' && readerOpen.initialTab) {
			this.activeTab = readerOpen.initialTab;
		}
		this.boundVisibilityHandler = () => this.handleVisibilityChange();
		this.boundBlurHandler = () => this.handleWindowBlur();
		this.engine = new RSVPEngine(
			this.settings,
			(state) => {
				const previousIsPlaying = this.previousIsPlaying;
				this.state = state;
				this.previousIsPlaying = state.isPlaying;
				this.sessionHooks?.onEngineStateChange?.(state, previousIsPlaying);
				this.render();
			},
			() => {
				this.render();
			},
			() => this.handleSectionComplete()
		);
	}

	async onOpen() {
		this.ownerDoc = this.containerEl.ownerDocument;
		this.containerEl.addClass('speed-reader-ai-modal-container');
		const { contentEl, modalEl } = this;
		modalEl.addClass('speed-reader-ai-modal');
		contentEl.empty();
		contentEl.addClass('speed-reader-ai-content');
		contentEl.setAttr('tabindex', '-1');
		contentEl.focus();

		applyReaderThemeToElement(contentEl, this.settings.reader.colorScheme);
		this.applyFontFamily();

		this.shellEl = contentEl.createDiv({ cls: 'speed-reader-ai-shell' });

		this.header = mountReaderHeader(this.shellEl, {
			rtl: this.settings.reader.textOrientation.rtl,
			showRemainingTime: this.settings.reader.display.showRemainingTime,
			showProgress: this.settings.reader.display.showProgress
		});
		this.header.onPlayPause(() => {
			this.toggleReaderPlayPause();
			this.refocusContent();
		});
		this.header.onProgressClick((percentage) => {
			this.engine.seekToPercent(percentage);
			this.refocusContent();
		});

		if (this.mobileReader) {
			applyMobileShellClass(this.shellEl);
			this.mobileProgressStripEl = mountMobileProgressStrip(this.shellEl);
		}

		const useMobilePausedStack =
			this.mobileReader && this.readerOpen.kind !== 'preferences';
		if (useMobilePausedStack) {
			this.mobilePausedStackEl = this.shellEl.createDiv({
				cls: 'speed-reader-ai-mobile-paused-stack'
			});
			if (this.mobileProgressStripEl) {
				this.mobileProgressStripEl.insertAdjacentElement(
					'afterend',
					this.mobilePausedStackEl
				);
			}

			this.mobileCompactBar = mountMobileCompactBar(this.mobilePausedStackEl, {
				onPlayPause: () => {
					this.toggleReaderPlayPause();
					this.refocusContent();
				},
				onWpmDelta: (delta) => this.adjustWpm(delta),
				onFontDelta: (delta) => this.adjustFontSize(delta),
				onPlaybackModeChange: (mode) => this.setPlaybackMode(mode),
			});
			this.mobileCompactBar.onClose(() => this.forceClose());
			this.mobileCompactBar.onChapterPillTap(() => {
				if (this.state?.isPlaying) {
					return;
				}
				this.openMobileMenu();
			});
		}

		const paneParent = this.mobilePausedStackEl ?? this.shellEl;
		this.paneStackEl = paneParent.createDiv({ cls: 'speed-reader-ai-pane-stack' });

		this.homePaneEl = this.paneStackEl.createDiv({ cls: 'speed-reader-ai-pane speed-reader-ai-pane-home' });
		this.wordContainer = this.homePaneEl.createDiv({ cls: 'speed-reader-ai-word-container' });
		this.applyFontSize();
		this.applyContextLineFontSize();

		this.wordDisplayEl = this.wordContainer.createDiv({ cls: 'speed-reader-ai-word-display' });
		this.interSectionOverlayEl = this.wordContainer.createDiv({
			cls: 'speed-reader-ai-inter-section-overlay is-hidden'
		});
		this.prepareOverlayEl = this.wordContainer.createDiv({
			cls: 'speed-reader-ai-prepare-overlay is-hidden'
		});
		this.prepareOverlayEl.createDiv({ cls: 'speed-reader-ai-prepare-spinner' });
		this.prepareOverlayEl.createSpan({
			cls: 'speed-reader-ai-prepare-title',
			text: PREPARE_OVERLAY_PRIMARY
		});
		this.prepareOverlaySublineEl = this.prepareOverlayEl.createSpan({
			cls: 'speed-reader-ai-prepare-subline is-hidden'
		});
		this.contextLine = mountContextLine(this.homePaneEl, {
			enableClickActivation: !this.mobileReader,
			lineOnlyContext: this.mobileReader,
			onWordActivate: (word) => {
				void this.wordLookupHandlers?.lookupWord(word);
			}
		});
		const onDictionaryDismiss = () => {
			this.dismissDictionaryOverlayIfVisible();
		};
		if (this.mobileReader) {
			this.mobileDictionarySheet = mountMobileDictionarySheet(this.shellEl, onDictionaryDismiss);
			this.mobileDictionarySheet.onOpenChange((open) => {
				this.mobileDictionaryOpen = open;
				this.render();
			});
		} else {
			this.dictionaryOverlay = mountDictionaryOverlay(this.wordContainer, onDictionaryDismiss);
		}

		this.structuredBarEl = this.homePaneEl.createDiv({
			cls: 'speed-reader-ai-structured-bar is-hidden'
		});
		this.modePickerHost = this.structuredBarEl.createDiv({ cls: 'speed-reader-ai-mode-picker-host' });
		this.versionPickerHost = this.structuredBarEl.createDiv({
			cls: 'speed-reader-ai-version-picker-host'
		});
		this.headingSelectWrapper = this.structuredBarEl.createDiv({
			cls: 'speed-reader-ai-section-select-wrapper is-hidden'
		});
		this.sectionSelect = this.headingSelectWrapper.createEl('select', {
			cls: 'speed-reader-ai-section-select'
		});
		this.sectionSelect.addEventListener('change', () => this.onHeadingSelectChange());

		this.contentPane = mountContentPane(this.paneStackEl, { isMobile: this.mobileReader });
		this.bookmarksPane = mountBookmarksPane(this.paneStackEl, { isMobile: this.mobileReader });
		this.bookmarksPane.onSeekLine((lineIndex) => {
			this.seekBookmarkLine(lineIndex);
		});
		this.bookmarksPane.onCreateFromSelection((lineIndices) => {
			void this.createBookmarkFromSelection(lineIndices);
		});
		this.bookmarksPane.onRemoveBookmark((lineIndex) => {
			void this.removeBookmarkForLine(lineIndex);
		});
		this.bookmarksPane.onOpenInObsidian(() => {
			void this.bookmarkHandlers?.openBookmarkMarkdownInObsidian();
		});
		this.bookmarksPane.onPlayPause(() => {
			this.toggleReaderPlayPause();
			this.refocusContent();
		});
		this.bookmarksPane.onSwipeBack(() => {
			this.popMobileRoute();
		});
		this.contentPane.onSwipeBack(() => {
			this.popMobileRoute();
		});
		this.settingsPane = mountSettingsPane(this.paneStackEl, this.settings, {
			onSave: (next) => {
				this.persistSettings(next);
				this.returnToReadingAfterPaneAction();
			},
			onDefaults: () => {
				const defaults = structuredClone(DEFAULT_SETTINGS);
				this.returnToReadingAfterPaneAction();
				return defaults;
			},
			onResetFontSize: () => {
				this.applyFontSize();
				this.applyContextLineFontSize();
				this.engine.setSettings(this.settings);
				this.returnToReadingAfterPaneAction();
			},
			showMobileGesturesGuide: this.mobileReader,
			isMobile: this.mobileReader
		});
		this.settingsPane.onSwipeBack(() => {
			this.popMobileRoute();
		});
		this.shortcutsPane = mountShortcutsPane(this.paneStackEl, { isMobile: this.mobileReader });
		this.shortcutsPane.onSwipeBack(() => {
			this.popMobileRoute();
		});
		this.advancedPane = mountAdvancedPane(this.paneStackEl, this.settings, {
			onSave: (next) => {
				this.persistSettings(next);
				this.returnToReadingAfterPaneAction();
			},
			isMobile: this.mobileReader
		});
		this.advancedPane.onSwipeBack(() => {
			this.popMobileRoute();
		});

		if (this.mobileReader) {
			this.mobileMenuHubPane = mountMobileMenuHubPane(this.paneStackEl, {
				onSelectRoute: (route) => this.pushMobileRoute(route),
				preferencesOnly: this.readerOpen.kind === 'preferences'
			});
			this.mobileMenuHubPane.onSwipeBack(() => {
				this.popMobileRoute();
			});
		}

		this.controlBar = mountReaderControlBar(
			this.shellEl,
			this.settings,
			{
				onWpmDelta: (delta) => this.adjustWpm(delta),
				onFontDelta: (delta) => this.adjustFontSize(delta),
				onPlaybackModeChange: (mode) => this.setPlaybackMode(mode),
				onReadWithoutAi: () => this.onReadWithoutAi(),
				onPrepare: () => this.onPrepareWithAi(),
				onClearCache: () => this.onClearDocumentCache(),
				onPrevSection: () => this.navigateToAdjacentSection(-1),
				onNextSection: () => this.navigateToAdjacentSection(1)
			},
			{
				showSectionNav: false,
				sectionNavLabel: this.readerOpen.kind === 'book' ? 'Chapter' : 'Section',
				showDocumentProgress: !this.mobileReader
			}
		);

		if (this.mobileReader && this.readerOpen.kind !== 'preferences') {
			this.mobileActionBar = mountMobileActionBar(this.mobilePausedStackEl!);
			this.mobileActionBar.onBookmark(() => {
				void this.createMobileBookmark();
			});
			this.mobileActionBar.onBookmarkExplorer(() => {
				void this.bookmarkHandlers?.openBookmarksTab();
			});
			this.mobileActionBar.onDefine(() => {
				void this.wordLookupHandlers?.lookupCurrentWord();
			});
			this.mobileActionBar.onMenu(() => {
				this.pushMobileRoute('more');
			});
		}

		if (this.mobileReader) {
			this.mobileBottomSheet = mountMobileBottomSheet(this.shellEl, this.engine, {
				onChapterSelect: (sectionId) => this.onMobileChapterSelect(sectionId),
				onFabClick:
					this.readerOpen.kind === 'preferences'
						? () => this.pushMobileRoute('more')
						: undefined
			});
			this.mobileBottomSheet.onOpenChange((open) => {
				this.mobileMenuOpen = open;
				if (open) {
					this.dismissDictionaryUi(false);
				}
				this.render();
			});
		} else {
			this.tabDock = mountReaderTabDock(
				this.shellEl,
				this.activeTab,
				(tab) => {
					if (tab === 'bookmarks') {
						this.showBookmarkPicker();
						return;
					}
					this.setActiveTab(tab);
				},
				{ preferencesOnly: this.readerOpen.kind === 'preferences' }
			);
		}

		if (this.readerOpen.kind === 'preferences') {
			this.setActiveTab(this.activeTab);
			this.registerKeyboardHandlers();
			if (this.mobileReader) {
				this.mountMobileGesturesIfNeeded();
			}
			return;
		}

		if (this.readerOpen.kind === 'structured' && this.manifestStore && this.preparePrompts) {
			this.session = new StructuredReaderSession(
				this.manifestStore,
				this.readerOpen.sourcePath,
				this.readerOpen.text,
				this.readerOpen.checksum,
				this.readerOpen.startOffset ?? 0,
				this.settings
			);
			const playbackOpts = this.playbackOptions();
			await this.session.initialize(this.readerOpen.preferredProcessingMode, playbackOpts);
			this.mountStructuredControls();
			const kind = await this.session.loadPlayback(
				this.engine,
				this.session.activeModeId,
				playbackOpts
			);
			if (this.readerOpen.resumePosition) {
				const processed = this.engine.getLoadedProcessedDocument();
				if (processed) {
					applyNoteResumePosition(this.engine, processed, this.readerOpen.resumePosition);
				}
			} else {
				if (this.readerOpen.sectionIndex !== undefined) {
					this.engine.goToSection(this.readerOpen.sectionIndex);
				}
				if (this.readerOpen.tokenIndex !== undefined) {
					this.engine.seekToToken(this.readerOpen.tokenIndex);
				}
			}
			this.syncPrepareStatus(kind);
			this.contentPane.setText(this.readerOpen.text, this.readerOpen.sourcePath);
		} else if (this.readerOpen.kind === 'book') {
			this.mountBookControls();
			const processed = bookIndexToProcessedDocument(this.readerOpen.bookIndex);
			this.engine.loadProcessedDocument(processed, {
				sectionIndex: this.readerOpen.sectionIndex ?? 0,
				tokenIndex: this.readerOpen.tokenIndex ?? 0,
				isDeterministic: true
			});
			const fullText = this.readerOpen.bookIndex.chapters.map((c) => c.words.join(' ')).join('\n\n');
			this.contentPane.setText(fullText, this.readerOpen.sourcePath);
		} else if (this.readerOpen.kind === 'legacy') {
			this.engine.loadText(this.readerOpen.text, this.readerOpen.startOffset ?? 0);
			this.contentPane.setText(this.readerOpen.text, 'Selected text');
		}

		this.rebuildHeadingSelector();
		this.controlBar.setPrepareVisible(this.readerOpen.kind === 'structured');
		this.prepareControls = this.controlBar.getPrepareControls();
		this.setActiveTab('home');
		this.registerKeyboardHandlers();
		this.registerFocusHandlers();
		this.mountMobileGesturesIfNeeded();
		this.mountMobileCoachMarksIfNeeded();
		this.updateModeSpecificUi();
		this.scheduleAutoStart();
	}

	close(): void {
		if (this.handleReaderBack()) {
			return;
		}
		this.forceClose();
	}

	forceClose(): void {
		super.close();
	}

	onClose() {
		if (this.focusMode || this.sidebarSnapshot) {
			this.setFocusMode(false);
		}
		this.clearAutoStartTimer();
		this.revokeCoverObjectUrl();
		this.bookmarkHandlers = null;
		this.wordLookupHandlers = null;
		this.dictionaryOverlay?.dismiss();
		this.dictionaryOverlay = null;
		this.mobileDictionarySheet?.destroy();
		this.mobileDictionarySheet = null;
		this.clearInterSectionTimer();
		this.hidePrepareOverlay();
		this.modePicker?.destroy();
		this.versionPicker?.destroy();
		this.prepareControls?.destroy();
		this.sectionNav?.destroy();
		this.chapterNav?.destroy();
		this.header?.destroy();
		this.controlBar?.destroy();
		this.contextLine?.destroy();
		this.tabDock?.destroy();
		this.mobileCompactBar?.destroy();
		this.mobileActionBar?.destroy();
		this.mobileBottomSheet?.destroy();
		this.mobileGestures?.destroy();
		this.stopEdgeScrub();
		this.clearSkipFlash();
		this.mobileCoachMarks?.destroy();
		this.mobileCoachMarks = null;
		removeMobileShellClass(this.shellEl, this.containerEl);
		this.contentPane?.destroy();
		this.bookmarksPane?.destroy();
		this.settingsPane?.destroy();
		this.shortcutsPane?.destroy();
		this.advancedPane?.destroy();
		this.mobileMenuHubPane?.destroy();
		this.mobileMenuHubPane = null;
		this.ownerDoc.removeEventListener('visibilitychange', this.boundVisibilityHandler);
		this.ownerDoc.defaultView?.removeEventListener('blur', this.boundBlurHandler);
		this.engine.pause();
		this.onSettingsChange(this.settings);
		this.contentEl.empty();
		this.onReaderClose?.();
	}

	showBookmarkPicker(): void {
		if (this.readerOpen.kind === 'legacy' || this.readerOpen.kind === 'preferences') {
			return;
		}

		this.engine.pause();
		const snapshot = buildBookmarkContextLines(this.engine);
		this.bookmarkContextLines = snapshot.lines;
		this.bookmarksPane?.setContextLines(snapshot.lines, snapshot.currentLineIndex, true);
		if (this.mobileReader) {
			this.pushMobileRoute('bookmarks');
		} else {
			this.setActiveTab('bookmarks');
		}
		void this.refreshBookmarksPaneData();
	}

	showBookmarkPickerFromService(): void {
		this.bookmarkHandlers?.openBookmarksTab();
	}

	private seekBookmarkLine(lineIndex: number): void {
		this.engine.seekToSentenceUnitIndex(lineIndex);
		this.engine.pause();
		const snapshot = buildBookmarkContextLines(this.engine);
		this.bookmarkContextLines = snapshot.lines;
		this.bookmarksPane?.setContextLines(snapshot.lines, snapshot.currentLineIndex, false);
		void this.refreshBookmarksPaneData();
	}

	private async createBookmarkFromSelection(lineIndices: number[]): Promise<void> {
		if (lineIndices.length === 0) {
			return;
		}
		await this.bookmarkHandlers?.createFromSelection(lineIndices, this.bookmarkContextLines);
		this.bookmarksPane?.clearSelection();
		this.showBookmarkPicker();
	}

	private async removeBookmarkForLine(lineIndex: number): Promise<void> {
		const removed = await this.bookmarkHandlers?.removeBookmarkForLine(
			lineIndex,
			this.bookmarkContextLines
		);
		if (!removed) {
			return;
		}
		this.bookmarksPane?.clearSelection();
		await this.refreshBookmarksPaneData();
		const snapshot = buildBookmarkContextLines(this.engine);
		this.bookmarkContextLines = snapshot.lines;
		this.bookmarksPane?.setContextLines(snapshot.lines, snapshot.currentLineIndex, false);
	}

	private buildBookmarksPaneTitle(): string {
		if (this.readerOpen.kind === 'book') {
			return this.readerOpen.bookIndex.title || this.readerOpen.sourcePath.split('/').pop() || 'Book';
		}
		if (this.readerOpen.kind === 'structured') {
			return this.readerOpen.sourcePath.split('/').pop()?.replace(/\.md$/i, '') || 'Note';
		}
		return 'Reading';
	}

	private buildBookmarksPaneSubtitle(state: ReaderState | null): string {
		const direction = this.settings.reader.textOrientation.rtl ? 'RTL' : 'LTR';
		if (!state) {
			return direction;
		}
		const modeLabel = getPlaybackModeLabel(state.playbackMode);
		const timePart =
			this.settings.reader.display.showRemainingTime && !state.finished
				? ` · ${formatRemainingTime(state.timeRemainingMs)}`
				: '';
		return `English · ${Math.round(state.currentWpm)} WPM · ${modeLabel} · ${direction}${timePart}`;
	}

	private refreshBookmarksPaneContext(state: ReaderState | null): void {
		this.bookmarksPane?.updateContext({
			title: this.buildBookmarksPaneTitle(),
			subtitle: this.buildBookmarksPaneSubtitle(state),
			isPlaying: Boolean(state?.isPlaying && !state.finished)
		});
	}

	private async refreshBookmarksPaneData(): Promise<void> {
		if (this.mobileReader ? this.mobileRoute !== 'bookmarks' : this.activeTab !== 'bookmarks') {
			return;
		}
		if (!this.bookmarkHandlers) {
			return;
		}

		this.refreshBookmarksPaneContext(this.state);

		if (this.readerOpen.kind !== 'book' && this.readerOpen.kind !== 'structured') {
			this.bookmarksPane?.setBookmarkedLineIndices(new Set());
			return;
		}

		const entries = await this.bookmarkHandlers.loadBookmarkEntries();
		const kind = this.readerOpen.kind === 'book' ? 'book' : 'note';
		const matched = matchBookmarkedLineIndices(entries, this.bookmarkContextLines, kind);
		this.bookmarksPane?.setBookmarkedLineIndices(matched);
	}

	setInitialTab(tab: ReaderTabId): void {
		this.activeTab = tab;
		this.tabDock?.setActiveTab(tab);
		this.setActiveTab(tab);
	}

	private goToReadingRoot(): void {
		if (this.readerOpen.kind === 'preferences') {
			this.forceClose();
			return;
		}
		this.mobileRouteStack = ['reading'];
		this.applyMobileRoute('reading');
		this.refocusContent();
	}

	private popMobileRoute(): void {
		if (this.mobileRouteStack.length <= 1) {
			this.goToReadingRoot();
			return;
		}
		this.mobileRouteStack.pop();
		const route = this.mobileRouteStack[this.mobileRouteStack.length - 1] ?? 'reading';
		if (route === 'reading' && this.readerOpen.kind === 'preferences') {
			this.forceClose();
			return;
		}
		this.applyMobileRoute(route);
		this.refocusContent();
	}

	private pushMobileRoute(route: MobileRoute): void {
		if (route === 'reading') {
			this.goToReadingRoot();
			return;
		}

		const top = this.mobileRouteStack[this.mobileRouteStack.length - 1] ?? 'reading';
		if (top === route) {
			this.applyMobileRoute(route);
			return;
		}

		if (top === 'reading') {
			if (route === 'bookmarks') {
				this.mobileRouteStack = ['reading', 'bookmarks'];
			} else if (route === 'more') {
				this.mobileRouteStack = ['reading', 'more'];
			} else {
				this.mobileRouteStack = ['reading', 'more', route];
			}
		} else if (top === 'more') {
			this.mobileRouteStack.push(route);
		} else {
			this.mobileRouteStack.pop();
			this.mobileRouteStack.push(route);
		}

		this.applyMobileRoute(route);
	}

	private applyMobileRoute(route: MobileRoute): void {
		this.mobileRoute = route;
		const tab = mobileRouteToReaderTab(route);

		if (this.mobileReader) {
			syncMobileRouteShell(this.shellEl, route);
			if (!isMobileReadingRoot(route)) {
				this.mobileBottomSheet?.close();
			}
		}

		const isReading = isMobileReadingRoot(route);
		const isMore = route === 'more';
		this.homePaneEl?.toggleClass('is-hidden', !isReading);
		this.mobileMenuHubPane?.setVisible(isMore);

		this.paneStackEl
			?.querySelector('.speed-reader-ai-pane-content')
			?.toggleClass('is-hidden', route !== 'content');
		this.paneStackEl
			?.querySelector('.speed-reader-ai-pane-bookmarks')
			?.toggleClass('is-hidden', route !== 'bookmarks');
		this.paneStackEl?.toggleClass('is-stack-active', isMobileStackRoute(route));
		this.paneStackEl
			?.querySelector('.speed-reader-ai-pane-settings')
			?.toggleClass('is-hidden', route !== 'settings');
		this.paneStackEl
			?.querySelector('.speed-reader-ai-pane-shortcuts')
			?.toggleClass('is-hidden', route !== 'shortcuts');
		this.paneStackEl
			?.querySelector('.speed-reader-ai-pane-advanced')
			?.toggleClass('is-hidden', route !== 'advanced');

		if (tab) {
			this.activeTab = tab;
			this.tabDock?.setActiveTab(tab);
		}

		this.header?.setProgressVisible(isReading && this.settings.reader.display.showProgress);
		this.contextLine?.setVisible(isReading && this.settings.reader.display.showContext);
		this.controlBar?.setVisible(
			isReading && !this.mobileReader && this.readerOpen.kind !== 'preferences'
		);
		this.shellEl?.toggleClass('is-preferences-only', this.readerOpen.kind === 'preferences');

		if (this.mobileReader) {
			this.syncMobileChrome(this.state);
		}

		if (route === 'settings') {
			this.settingsPane?.refresh(this.settings);
		}
		if (route === 'advanced') {
			this.advancedPane?.refresh(this.settings);
		}
		if (route === 'bookmarks') {
			void this.refreshBookmarksPaneData();
		}
		if (isReading) {
			this.refocusContent();
		}
	}

	private setActiveTab(tab: ReaderTabId) {
		if (this.mobileReader) {
			if (tab === 'home') {
				this.goToReadingRoot();
			} else {
				this.pushMobileRoute(readerTabToMobileRoute(tab));
			}
			return;
		}

		this.activeTab = tab;
		this.tabDock?.setActiveTab(tab);
		const isHome = tab === 'home';
		this.homePaneEl?.toggleClass('is-hidden', !isHome);
		this.paneStackEl
			?.querySelector('.speed-reader-ai-pane-content')
			?.toggleClass('is-hidden', tab !== 'content');
		this.paneStackEl
			?.querySelector('.speed-reader-ai-pane-bookmarks')
			?.toggleClass('is-hidden', tab !== 'bookmarks');
		this.paneStackEl?.toggleClass('is-stack-active', tab !== 'home');
		this.paneStackEl
			?.querySelector('.speed-reader-ai-pane-settings')
			?.toggleClass('is-hidden', tab !== 'settings');
		this.paneStackEl
			?.querySelector('.speed-reader-ai-pane-shortcuts')
			?.toggleClass('is-hidden', tab !== 'shortcuts');
		this.paneStackEl
			?.querySelector('.speed-reader-ai-pane-advanced')
			?.toggleClass('is-hidden', tab !== 'advanced');

		this.header?.setProgressVisible(isHome && this.settings.reader.display.showProgress);
		this.contextLine?.setVisible(isHome && this.settings.reader.display.showContext);
		this.controlBar?.setVisible(isHome && this.readerOpen.kind !== 'preferences');
		this.shellEl?.toggleClass('is-preferences-only', this.readerOpen.kind === 'preferences');

		if (tab === 'settings') {
			this.settingsPane?.refresh(this.settings);
		}
		if (tab === 'advanced') {
			this.advancedPane?.refresh(this.settings);
		}
		if (tab === 'bookmarks') {
			void this.refreshBookmarksPaneData();
		}
		if (isHome) {
			this.refocusContent();
		}
	}

	private persistSettings(next: SpeedReaderAiSettings) {
		this.settings = validateSettings(next, this.llmModelCatalog);
		this.engine.setSettings(this.settings);
		applyReaderThemeToElement(this.contentEl, this.settings.reader.colorScheme);
		this.applyFontFamily();
		this.applyFontSize();
		this.applyContextLineFontSize();
		this.header?.setProgressVisible(this.settings.reader.display.showProgress);
		this.onSettingsChange(this.settings);
		new Notice('Settings saved');
	}

	private scheduleAutoStart() {
		this.clearAutoStartTimer();
		if (this.readerOpen.kind === 'preferences') {
			return;
		}
		if (!this.settings.reader.autoStart.enabled) {
			return;
		}
		const seconds = this.settings.reader.autoStart.seconds;
		this.autoStartTimer = window.setTimeout(() => {
			this.startPlayback();
		}, seconds * 1000);
	}

	private clearAutoStartTimer() {
		if (this.autoStartTimer !== null) {
			window.clearTimeout(this.autoStartTimer);
			this.autoStartTimer = null;
		}
	}

	private applyFontFamily() {
		this.wordContainer?.style.setProperty(
			'--speed-reader-ai-font-family',
			readerFontFamily(this.settings.reader.font)
		);
	}

	setSessionHooks(hooks: ReaderSessionHooks | undefined): void {
		this.sessionHooks = hooks;
	}

	setBookmarkHandlers(handles: ReaderBookmarkHandles | null): void {
		this.bookmarkHandlers = handles;
	}

	setWordLookupHandlers(handles: ReaderWordLookupHandles | null): void {
		this.wordLookupHandlers = handles;
	}

	setDictionarySaveHandler(handler: (() => void | Promise<void>) | null): void {
		this.dictionaryOverlay?.setSaveHandler(handler);
		this.mobileDictionarySheet?.setSaveHandler(handler);
	}

	setDictionarySaveState(state: DictionarySaveButtonState): void {
		this.dictionaryOverlay?.setSaveState(state);
		this.mobileDictionarySheet?.setSaveState(state);
	}

	getWordLookupHandlers(): ReaderWordLookupHandles | null {
		return this.wordLookupHandlers;
	}

	isDictionaryOverlayVisible(): boolean {
		if (this.mobileReader) {
			return this.mobileDictionarySheet?.isVisible() ?? false;
		}
		return this.dictionaryOverlay?.isVisible() ?? false;
	}

	dismissDictionaryOverlay(): void {
		this.dismissDictionaryUi(false);
	}

	private dismissDictionaryUi(resumePlayback: boolean): void {
		if (!this.isDictionaryOverlayVisible()) {
			return;
		}
		const shouldResume = resumePlayback && this.wasPlayingBeforeDictionary;
		this.wasPlayingBeforeDictionary = false;
		if (this.mobileReader) {
			this.mobileDictionarySheet?.dismiss();
		} else {
			this.dictionaryOverlay?.dismiss();
		}
		if (shouldResume) {
			this.engine.play();
		}
	}

	showDictionaryLoading(word: string): void {
		if (this.mobileReader) {
			this.mobileBottomSheet?.close();
			this.mobileDictionarySheet?.showLoading(word);
			return;
		}
		this.dictionaryOverlay?.showLoading(word);
	}

	showDictionaryOutcome(outcome: DictionaryLookupOutcome): void {
		if (this.mobileReader) {
			this.mobileDictionarySheet?.showOutcome(outcome);
			return;
		}
		this.dictionaryOverlay?.showOutcome(outcome);
	}

	private openMobileMenu(): void {
		this.dismissDictionaryUi(false);
		this.mobileBottomSheet?.open();
	}

	private closeMobileOverlays(): void {
		this.mobileBottomSheet?.close();
		this.dismissDictionaryUi(false);
	}

	private isMobileOverlayOpen(): boolean {
		return this.mobileMenuOpen || this.mobileDictionaryOpen;
	}

	enginePauseForLookup(): void {
		const state = this.state;
		this.wasPlayingBeforeDictionary = Boolean(state?.isPlaying && !state.finished);
		if (this.wasPlayingBeforeDictionary) {
			this.engine.pause();
		}
	}

	getReaderOpen(): SpeedReaderOpen {
		return this.readerOpen;
	}

	getReaderState(): ReaderState | null {
		return this.state;
	}

	getStructuredSession(): StructuredReaderSession | null {
		return this.session;
	}

	notifyPlaybackReloaded(kind: PlaybackLoadKind): void {
		this.syncPrepareStatus(kind);
		void this.onCacheCleared?.();
	}

	getEngine(): RSVPEngine {
		return this.engine;
	}

	refreshControlsBar(): void {
		this.render();
	}

	private notifySectionChange(): void {
		const state = this.state;
		if (!state) {
			return;
		}
		const sectionId = this.engine.getSectionList()[state.currentSectionIndex ?? 0]?.id;
		if (sectionId) {
			this.sessionHooks?.onSectionChange?.(sectionId);
		}
	}

	private navigateToAdjacentSection(direction: 1 | -1): void {
		if (!this.canNavigateSections()) {
			return;
		}
		const wasPlaying = Boolean(this.state?.isPlaying);
		if (wasPlaying) {
			this.engine.pause();
		}
		if (direction > 0) {
			this.engine.nextSection();
		} else {
			this.engine.prevSection();
		}
		this.notifySectionChange();
		if (wasPlaying) {
			this.startPlayback();
		}
		this.refocusContent();
	}

	private jumpToSection(sectionId: string): void {
		if (!this.engine.getSectionList().some((s) => s.id === sectionId)) {
			return;
		}
		const wasPlaying = Boolean(this.state?.isPlaying);
		if (wasPlaying) {
			this.engine.pause();
		}
		this.engine.goToSection(sectionId);
		this.notifySectionChange();
		if (wasPlaying) {
			this.startPlayback();
		}
		this.refocusContent();
	}

	private getSectionNavLabel(): string {
		return this.readerOpen.kind === 'book' ? 'Chapter' : 'Section';
	}

	private getCurrentSectionTitle(): string {
		const state = this.state;
		const fromState = state?.sectionTitle?.trim();
		if (fromState) {
			return fromState;
		}
		const index = state?.currentSectionIndex ?? 0;
		const sections = this.engine.getSectionList();
		return sections[index]?.title?.trim() || this.getSectionNavLabel();
	}

	private hasMultipleSections(): boolean {
		return this.engine.getSectionList().length > 1;
	}

	private needsSectionIntro(): boolean {
		if (!this.hasMultipleSections()) {
			return false;
		}
		const index = this.state?.currentSectionIndex ?? 0;
		return this.sectionIntroShownForIndex !== index;
	}

	private markSectionIntroShown(): void {
		this.sectionIntroShownForIndex = this.state?.currentSectionIndex ?? 0;
	}

	private toggleReaderPlayPause(): void {
		if (this.state?.isPlaying) {
			this.engine.togglePlayPause();
			return;
		}
		this.startPlayback();
	}

	private startPlayback(): void {
		if (this.skipNextSectionIntro) {
			this.skipNextSectionIntro = false;
			this.markSectionIntroShown();
			this.engine.play();
			return;
		}
		if (this.needsSectionIntro()) {
			this.engine.pause();
			this.showSectionIntroOverlay(() => {
				this.markSectionIntroShown();
				this.engine.play();
			});
			return;
		}
		this.engine.play();
	}

	private playbackOptions() {
		const preferredVersionId =
			this.readerOpen.kind === 'structured'
				? this.readerOpen.preferredAiVersionId
				: undefined;
		return {
			preferLatestReady: this.mobileReader,
			preferredVersionId
		};
	}

	private refreshVersionPicker(): void {
		if (!this.session || this.mobileReader) {
			return;
		}
		const versions = this.session.listVersionsForUi();
		if (versions.length === 0) {
			this.versionPicker?.setVisible(false);
			return;
		}
		if (!this.versionPicker) {
			this.versionPicker = mountVersionPicker(
				this.versionPickerHost,
				versions,
				this.session.activeVersionId,
				(versionId) => this.onVersionChange(versionId)
			);
		} else {
			this.versionPicker.refresh(versions);
			if (this.session.activeVersionId) {
				this.versionPicker.setValue(this.session.activeVersionId);
			}
			this.versionPicker.setVisible(true);
		}
	}

	private mountStructuredControls() {
		if (!this.session) return;

		this.modePicker = mountModePicker(
			this.modePickerHost,
			this.session.activeModeId,
			(modeId) => this.onModeChange(modeId)
		);
		this.refreshVersionPicker();

		const sectionHost = this.structuredBarEl.createDiv({ cls: 'speed-reader-ai-section-nav-host' });
		this.sectionNav = mountSectionNavControls(sectionHost, this.engine, {
			onPrevSection: () => this.navigateToAdjacentSection(-1),
			onNextSection: () => this.navigateToAdjacentSection(1),
			onJumpToSection: (id) => this.jumpToSection(id)
		});
		if (!this.mobileReader) {
			this.structuredBarEl.removeClass('is-hidden');
		}
	}

	private mountBookControls() {
		const sectionHost = this.structuredBarEl.createDiv({ cls: 'speed-reader-ai-section-nav-host' });
		this.chapterNav = mountChapterNavControls(sectionHost, this.engine, {
			onPrevChapter: () => this.navigateToAdjacentSection(-1),
			onNextChapter: () => this.navigateToAdjacentSection(1),
			onJumpToChapter: (id) => this.jumpToSection(id)
		});
	}

	private async onVersionChange(versionId: string) {
		if (!this.session) return;
		await this.session.setActiveVersion(versionId);
		this.versionPicker?.setValue(versionId);
		this.modePicker?.setValue(this.session.activeModeId);
		const kind = await this.session.loadPlayback(
			this.engine,
			this.session.activeModeId,
			this.playbackOptions()
		);
		this.syncPrepareStatus(kind);
		this.rebuildHeadingSelector();
		this.sectionNav?.refresh();
		this.updateModeSpecificUi();
		void this.onCacheCleared?.();
	}

	private async onModeChange(modeId: ProcessingModeId) {
		if (!this.session) return;
		await this.session.setActiveMode(modeId);
		this.modePicker?.setValue(modeId);
		const kind = await this.session.loadPlayback(
			this.engine,
			modeId,
			this.playbackOptions()
		);
		this.syncPrepareStatus(kind);
		this.rebuildHeadingSelector();
		this.sectionNav?.refresh();
		this.updateModeSpecificUi();
	}

	private onReadWithoutAi() {
		if (!this.session) return;
		this.session.loadDeterministic(this.engine, this.session.activeModeId);
		this.prepareControls?.setStatus('deterministic');
		this.rebuildHeadingSelector();
		this.sectionNav?.refresh();
		this.updateModeSpecificUi();
	}

	private async onClearDocumentCache() {
		if (!this.session) return;
		const confirmed = confirm(
			'Remove AI prepare cache for this note? You can prepare again later.'
		);
		if (!confirmed) return;

		const removed = await this.session.clearCache(this.engine);
		this.syncPrepareStatus('deterministic');
		this.versionPicker?.setVisible(false);
		this.rebuildHeadingSelector();
		this.sectionNav?.refresh();
		this.updateModeSpecificUi();
		if (removed) {
			new Notice('AI prepare cache cleared for this note.');
		} else {
			new Notice('No AI prepare cache found for this note.');
		}
		await this.onCacheCleared?.();
	}

	private async onPrepareWithAi() {
		if (!this.session) return;

		this.engine.pause();
		this.prepareControls?.setPreparing(true);
		this.showPrepareOverlay();
		const llm = new SettingsBackedLlmClient({
			getSettings: () => this.settings,
			getAiProviders: () => getAiProvidersApi(this.app)
		});
		try {
			await this.session.prepareWithAi(
				this.session.activeModeId,
				{
					llm,
					prompts: this.preparePrompts!,
					settings: {
						prepareSingleCallMaxChars: this.settings.ai.prepareSingleCallMaxChars,
						prepareSingleCallMaxLines: this.settings.ai.prepareSingleCallMaxLines,
						llmModel: this.settings.ai.llmModel
					},
					onPrepareProgress: (info) => {
						this.updatePrepareOverlay(
							`Batch ${info.current} of ${info.total}`
						);
					}
				},
				this.engine
			);
			await this.session.refreshIndex();
			this.modePicker?.setValue(this.session.activeModeId);
			this.refreshVersionPicker();
			this.syncPrepareStatus('ai');
			this.rebuildHeadingSelector();
			this.sectionNav?.refresh();
			this.updateModeSpecificUi();
			void this.onCacheCleared?.();
		} catch (e: unknown) {
			this.prepareControls?.setStatus('error');
			const message = e instanceof Error ? e.message : String(e);
			new Notice(
				`Prepare failed: ${message}. Check LLM backend (${describeActiveLlmBackend(this.settings)}) in plugin settings.`
			);
		} finally {
			this.prepareControls?.setPreparing(false);
			this.hidePrepareOverlay();
		}
	}

	private syncPrepareStatus(kind: 'ai' | 'deterministic') {
		if (!this.session) return;
		const modeStatus = this.session.modeStatus();
		if (modeStatus === 'stale') {
			this.prepareControls?.setStatus('stale');
		} else if (kind === 'ai') {
			this.prepareControls?.setStatus('prepared');
		} else {
			this.prepareControls?.setStatus('deterministic');
		}
	}

	private updateModeSpecificUi() {
		const profile = this.engine.getReaderUxProfile();
		const isStructured = this.readerOpen.kind === 'structured';
		const isBook = this.readerOpen.kind === 'book';
		const hideStructuredBar =
			(!isStructured && !isBook) || this.mobileReader;
		this.structuredBarEl?.toggleClass('is-hidden', hideStructuredBar);

		this.controlBar?.setPrepareVisible(isStructured);
		this.prepareControls = this.controlBar?.getPrepareControls() ?? null;

		if (this.sectionNav) {
			const showSectionNav =
				!this.mobileReader && isStructured && (profile?.sectionNav ?? false);
			this.sectionNav.setVisible(showSectionNav);
			if (showSectionNav) {
				this.sectionNav.refresh();
			}
		}

		if (this.chapterNav) {
			const showChapterNav = !this.mobileReader && isBook && (profile?.sectionNav ?? false);
			this.chapterNav.setVisible(showChapterNav);
			if (showChapterNav) {
				this.chapterNav.refresh();
			}
		}

		const showSectionNav = this.canNavigateSections();
		this.controlBar?.setVisible(
			this.activeTab === 'home' &&
				!this.mobileReader &&
				this.readerOpen.kind !== 'preferences'
		);
		// Re-mount control bar nav visibility via update - section nav buttons in control bar
		this.render();
		this.renderSectionVisibility();
	}

	private handleSectionComplete() {
		const state = this.state;
		const sections = this.engine.getSectionList();
		const nextIndex = (state?.currentSectionIndex ?? 0) + 1;
		if (nextIndex >= sections.length) {
			return;
		}

		const isBook = this.readerOpen.kind === 'book';
		const nextLabel = isBook ? 'Next chapter' : 'Next section';
		const nextTitle = sections[nextIndex]?.title ?? nextLabel;
		this.engine.pause();
		this.showInterSectionOverlay(nextLabel, nextTitle, () => {
			this.skipNextSectionIntro = true;
			this.engine.nextSection();
			this.notifySectionChange();
			this.startPlayback();
		});
	}

	private showSectionIntroOverlay(onStart: () => void) {
		if (!this.interSectionOverlayEl) return;
		this.clearInterSectionTimer();
		this.interSectionOverlayEl.empty();
		this.interSectionOverlayEl.removeClass('is-hidden');
		this.interSectionOverlayEl.createSpan({
			cls: 'speed-reader-ai-inter-section-label',
			text: this.getSectionNavLabel()
		});
		this.interSectionOverlayEl.createSpan({
			cls: 'speed-reader-ai-inter-section-title speed-reader-ai-section-intro-title',
			text: this.getCurrentSectionTitle()
		});
		const countdownSeconds = Math.round(SECTION_INTRO_MS / 1000);
		const countdownEl = this.interSectionOverlayEl.createSpan({
			cls: 'speed-reader-ai-inter-section-countdown'
		});
		const setCountdownText = (seconds: number) => {
			countdownEl.setText(
				seconds === 1 ? 'Starting in 1 second…' : `Starting in ${seconds} seconds…`
			);
		};
		setCountdownText(countdownSeconds);
		const startBtn = this.interSectionOverlayEl.createEl('button', {
			cls: 'speed-reader-ai-btn speed-reader-ai-btn-secondary',
			text: 'Start reading'
		});
		startBtn.addEventListener('click', () => this.dismissInterSectionOverlay(onStart), {
			once: true
		});

		let remaining = countdownSeconds;
		this.interSectionCountdownInterval = window.setInterval(() => {
			remaining -= 1;
			if (remaining <= 0) {
				this.clearInterSectionCountdownInterval();
				return;
			}
			setCountdownText(remaining);
		}, 1000);

		this.interSectionTimer = window.setTimeout(() => {
			this.dismissInterSectionOverlay(onStart);
		}, SECTION_INTRO_MS);
	}

	private showInterSectionOverlay(
		nextLabel: string,
		nextTitle: string,
		onContinue: () => void
	) {
		if (!this.interSectionOverlayEl) return;
		this.clearInterSectionTimer();
		this.interSectionOverlayEl.empty();
		this.interSectionOverlayEl.removeClass('is-hidden');
		this.interSectionOverlayEl.createSpan({
			cls: 'speed-reader-ai-inter-section-label',
			text: nextLabel
		});
		this.interSectionOverlayEl.createSpan({
			cls: 'speed-reader-ai-inter-section-title',
			text: nextTitle
		});
		this.interSectionOverlayEl.createSpan({
			cls: 'speed-reader-ai-inter-section-done',
			text: 'Finished'
		});
		const countdownSeconds = Math.round(INTER_SECTION_MS / 1000);
		const countdownEl = this.interSectionOverlayEl.createSpan({
			cls: 'speed-reader-ai-inter-section-countdown'
		});
		const setCountdownText = (seconds: number) => {
			countdownEl.setText(
				seconds === 1
					? 'Starting next in 1 second…'
					: `Starting next in ${seconds} seconds…`
			);
		};
		setCountdownText(countdownSeconds);
		const skip = this.interSectionOverlayEl.createEl('button', {
			cls: 'speed-reader-ai-btn speed-reader-ai-btn-secondary',
			text: 'Continue now'
		});
		skip.addEventListener('click', () => this.dismissInterSectionOverlay(onContinue), {
			once: true
		});

		let remaining = countdownSeconds;
		this.interSectionCountdownInterval = window.setInterval(() => {
			remaining -= 1;
			if (remaining <= 0) {
				this.clearInterSectionCountdownInterval();
				return;
			}
			setCountdownText(remaining);
		}, 1000);

		this.interSectionTimer = window.setTimeout(() => {
			this.dismissInterSectionOverlay(onContinue);
		}, INTER_SECTION_MS);
	}

	private dismissInterSectionOverlay(onContinue: () => void) {
		if (this.interSectionOverlayEl?.hasClass('is-hidden')) {
			return;
		}
		this.clearInterSectionTimer();
		this.interSectionOverlayEl?.addClass('is-hidden');
		onContinue();
	}

	private clearInterSectionCountdownInterval() {
		if (this.interSectionCountdownInterval !== null) {
			window.clearInterval(this.interSectionCountdownInterval);
			this.interSectionCountdownInterval = null;
		}
	}

	private clearInterSectionTimer() {
		this.clearInterSectionCountdownInterval();
		if (this.interSectionTimer !== null) {
			window.clearTimeout(this.interSectionTimer);
			this.interSectionTimer = null;
		}
	}

	private isInputBlockedByOverlay(): boolean {
		if (!this.interSectionOverlayEl?.hasClass('is-hidden')) {
			return true;
		}
		if (!this.prepareOverlayEl?.hasClass('is-hidden')) {
			return true;
		}
		if (this.isDictionaryOverlayVisible()) {
			return true;
		}
		if (this.mobileMenuOpen) {
			return true;
		}
		return false;
	}

	private buildBackSnapshot() {
		return {
			activeTab: this.activeTab,
			mobileRoute: this.mobileReader ? this.mobileRoute : null,
			preferencesOnly: this.readerOpen.kind === 'preferences',
			dictionaryVisible: this.isDictionaryOverlayVisible(),
			coachMarksOpen: this.mobileCoachOpen,
			bottomSheetOpen: this.mobileMenuOpen,
			focusMode: this.focusMode
		};
	}

	private executeReaderBackAction(action: ReaderBackAction): void {
		switch (action) {
			case 'dismiss-dictionary':
				this.dismissDictionaryUi(true);
				break;
			case 'dismiss-coach-marks':
				this.mobileCoachMarks?.dismiss();
				break;
			case 'close-bottom-sheet':
				this.mobileBottomSheet?.close();
				break;
			case 'go-home':
				this.popMobileRoute();
				break;
			case 'exit-focus-mode':
				this.setFocusMode(false);
				break;
			case 'close-modal':
				this.forceClose();
				break;
		}
	}

	private handleReaderBack(): boolean {
		const action = resolveReaderBackAction(this.buildBackSnapshot());
		if (action === 'close-modal') {
			return false;
		}
		this.executeReaderBackAction(action);
		return true;
	}

	private returnToReadingAfterPaneAction(): void {
		if (this.readerOpen.kind === 'preferences') {
			this.forceClose();
			return;
		}
		if (this.activeTab !== 'home') {
			this.setActiveTab('home');
			this.refocusContent();
		}
	}

	private dismissDictionaryOverlayIfVisible(): boolean {
		if (!this.isDictionaryOverlayVisible()) {
			return false;
		}
		this.dismissDictionaryUi(true);
		this.refocusContent();
		return true;
	}

	private showPrepareOverlay() {
		if (!this.prepareOverlayEl) return;
		this.updatePrepareOverlay();
		this.prepareOverlayEl.removeClass('is-hidden');
	}

	private hidePrepareOverlay() {
		if (!this.prepareOverlayEl) return;
		this.prepareOverlayEl.addClass('is-hidden');
		this.updatePrepareOverlay();
	}

	private updatePrepareOverlay(subline?: string) {
		if (!this.prepareOverlaySublineEl) return;
		if (subline) {
			this.prepareOverlaySublineEl.removeClass('is-hidden');
			this.prepareOverlaySublineEl.setText(subline);
		} else {
			this.prepareOverlaySublineEl.addClass('is-hidden');
			this.prepareOverlaySublineEl.setText('');
		}
	}

	private registerKeyboardHandlers() {
		this.scope.register([], ' ', (event) => {
			event.preventDefault();
			if (this.dismissDictionaryOverlayIfVisible()) {
				return false;
			}
			if (this.isInputBlockedByOverlay()) {
				return false;
			}
			this.toggleReaderPlayPause();
			return false;
		});

		this.scope.register([], 'ArrowLeft', (event) => {
			event.preventDefault();
			this.handleArrowLeft();
			return false;
		});

		this.scope.register([], 'ArrowRight', (event) => {
			event.preventDefault();
			this.handleArrowRight();
			return false;
		});

		this.scope.register(['Shift'], 'ArrowLeft', (event) => {
			event.preventDefault();
			this.handleShiftArrowLeft();
			return false;
		});

		this.scope.register(['Shift'], 'ArrowRight', (event) => {
			event.preventDefault();
			this.handleShiftArrowRight();
			return false;
		});

		this.scope.register([], 'ArrowUp', (event) => {
			event.preventDefault();
			this.adjustWpm(25);
			return false;
		});

		this.scope.register([], 'ArrowDown', (event) => {
			event.preventDefault();
			this.adjustWpm(-25);
			return false;
		});

		this.scope.register([], '[', (event) => {
			event.preventDefault();
			this.adjustFontSize(-FONT_SIZE_STEP);
			return false;
		});

		this.scope.register([], ']', (event) => {
			event.preventDefault();
			this.adjustFontSize(FONT_SIZE_STEP);
			return false;
		});

		this.scope.register([], 'f', (event) => {
			event.preventDefault();
			this.setFocusMode(!this.focusMode);
			return false;
		});

		this.scope.register([], 'l', (event) => {
			event.preventDefault();
			this.engine.togglePlaybackMode();
			this.render();
			return false;
		});

		this.scope.register([], 'b', (event) => {
			event.preventDefault();
			if (this.isInputBlockedByOverlay()) {
				return false;
			}
			void this.bookmarkHandlers?.createBookmark();
			return false;
		});

		this.scope.register([], 'd', (event) => {
			event.preventDefault();
			if (this.isInputBlockedByOverlay() && !this.isDictionaryOverlayVisible()) {
				return false;
			}
			void this.wordLookupHandlers?.lookupCurrentWord();
			return false;
		});

		this.scope.register(['Shift'], 'b', (event) => {
			event.preventDefault();
			if (this.isInputBlockedByOverlay()) {
				return false;
			}
			void this.bookmarkHandlers?.openBookmarksTab();
			return false;
		});

		this.scope.register([], 'Escape', (event) => {
			event.preventDefault();
			if (this.handleReaderBack()) {
				return false;
			}
			this.forceClose();
			return false;
		});

		this.contentEl.addEventListener('keydown', (event) => {
			if (event.key === ' ') {
				event.preventDefault();
				if (this.dismissDictionaryOverlayIfVisible()) {
					return;
				}
				if (this.isInputBlockedByOverlay()) {
					return;
				}
				this.toggleReaderPlayPause();
			}
		});
	}

	private handleArrowLeft() {
		if (this.state && isLinePlaybackMode(this.state.playbackMode)) {
			this.engine.prevLine();
		} else {
			this.engine.rewindSmart();
		}
		this.refocusContent();
	}

	private handleArrowRight() {
		if (this.state && isLinePlaybackMode(this.state.playbackMode)) {
			this.engine.nextLine();
		} else {
			this.engine.fastForwardSmart();
		}
		this.refocusContent();
	}

	private handleShiftArrowLeft() {
		this.navigateToAdjacentSection(-1);
	}

	private handleShiftArrowRight() {
		this.navigateToAdjacentSection(1);
	}

	private canNavigateSections(): boolean {
		const profile = this.engine.getReaderUxProfile();
		return (
			(this.readerOpen.kind === 'structured' || this.readerOpen.kind === 'book') &&
			(profile?.sectionNav ?? false) &&
			this.engine.getSectionList().length > 0
		);
	}

	private getDocumentProgressSourceKind(): SourceKind | null {
		if (this.readerOpen.kind === 'book') {
			return 'book';
		}
		if (this.readerOpen.kind === 'structured' || this.readerOpen.kind === 'legacy') {
			return 'note';
		}
		return null;
	}

	private getDocumentProgressPercent(state: ReaderState): number | null {
		const sourceKind = this.getDocumentProgressSourceKind();
		if (!sourceKind) {
			return null;
		}
		return computeDocumentProgressFromEngine({
			sourceKind,
			bookIndex: this.readerOpen.kind === 'book' ? this.readerOpen.bookIndex : undefined,
			engine: this.engine,
			state
		});
	}

	private registerFocusHandlers() {
		this.ownerDoc.addEventListener('visibilitychange', this.boundVisibilityHandler);
		this.ownerDoc.defaultView?.addEventListener('blur', this.boundBlurHandler);
	}

	private setFocusMode(enabled: boolean) {
		if (enabled && this.activeTab !== 'home') {
			this.setActiveTab('home');
		}
		this.focusMode = enabled;
		this.contentEl.toggleClass('speed-reader-ai-focus-active', this.focusMode);
		this.containerEl.toggleClass('is-focus-active', this.focusMode);
		if (!this.mobileReader) {
			this.sidebarSnapshot = applyDesktopFocusChrome(
				this.app.workspace,
				enabled,
				this.sidebarSnapshot
			);
		}
		this.render();
	}

	private handleVisibilityChange() {
		if (this.ownerDoc.hidden) {
			this.pauseIfPlaying();
		} else if (this.wasPlayingBeforeBlur) {
			this.wasPlayingBeforeBlur = false;
			this.engine.play();
		}
	}

	private handleWindowBlur() {
		if (!this.ownerDoc.hidden) {
			this.pauseIfPlaying();
		}
	}

	private pauseIfPlaying() {
		const state = this.state;
		if (state?.isPlaying) {
			this.wasPlayingBeforeBlur = true;
			this.engine.pause();
		}
	}

	private refocusContent() {
		const active = this.ownerDoc.activeElement;
		if (active instanceof HTMLButtonElement || active instanceof HTMLSelectElement) {
			this.contentEl.focus();
		}
	}

	private rebuildHeadingSelector() {
		if (!this.sectionSelect) return;

		this.sectionSelect.empty();
		this.sectionSelect.createEl('option', { text: 'Jump to section', value: '' });

		const profile = this.engine.getReaderUxProfile();
		if (profile?.sectionNav === false && this.engine.getStreamHeadings().length > 0) {
			for (const heading of this.engine.getStreamHeadings()) {
				this.sectionSelect.createEl('option', {
					text: heading.title,
					value: heading.title
				});
			}
			return;
		}

		if (this.engine.getSectionList().length > 0) {
			for (const section of this.engine.getSectionList()) {
				this.sectionSelect.createEl('option', {
					text: section.title,
					value: section.id
				});
			}
			return;
		}

		for (const heading of this.engine.getHeadings()) {
			this.sectionSelect.createEl('option', {
				text: headingLabel(heading),
				value: String(heading.wordIndex)
			});
		}
	}

	private onHeadingSelectChange() {
		const value = this.sectionSelect.value;
		if (value.length === 0) return;

		const profile = this.engine.getReaderUxProfile();
		if (profile?.sectionNav === false) {
			this.engine.seekToHeading(value);
		} else if (this.engine.getSectionList().some((s) => s.id === value)) {
			this.jumpToSection(value);
			this.sectionSelect.value = '';
			return;
		} else {
			const wordIndex = Number.parseInt(value, 10);
			if (!Number.isNaN(wordIndex)) {
				this.engine.jumpToHeading(wordIndex);
			}
		}

		this.sectionSelect.value = '';
		this.refocusContent();
	}

	private adjustWpm(delta: number) {
		const newWpm = this.engine.adjustWpm(delta);
		this.settings = {
			...this.settings,
			reader: { ...this.settings.reader, wpm: newWpm }
		};
		this.engine.setSettings(this.settings);
		new Notice(`Speed: ${newWpm} WPM`);
	}

	private setReaderWpm(wpm: number) {
		const clamped = Math.max(50, Math.min(5000, Math.round(wpm)));
		const delta = clamped - this.settings.reader.wpm;
		if (delta === 0) {
			return;
		}
		const newWpm = this.engine.adjustWpm(delta);
		this.settings = {
			...this.settings,
			reader: { ...this.settings.reader, wpm: newWpm }
		};
		this.engine.setSettings(this.settings);
	}

	private setPlaybackMode(mode: PlaybackMode) {
		this.engine.setPlaybackMode(mode);
		this.render();
	}

	private setReaderFontSize(fontSize: number) {
		const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(fontSize)));
		if (clamped === this.settings.reader.fontSize) {
			return;
		}
		this.settings = {
			...this.settings,
			reader: { ...this.settings.reader, fontSize: clamped }
		};
		this.applyFontSize();
		this.applyContextLineFontSize();
		this.engine.setSettings(this.settings);
	}

	private applyFontSize() {
		this.wordContainer?.style.setProperty(
			'--speed-reader-ai-font-size',
			`${this.settings.reader.fontSize}px`
		);
	}

	private applyContextLineFontSize() {
		this.contextLine?.getRootEl().style.setProperty(
			'--speed-reader-ai-context-line-font-size',
			`${this.settings.reader.contextLineFontSize}px`
		);
	}

	private showBriefWpmNotice(wpm: number) {
		new Notice(`${wpm} WPM`, 800);
	}

	private adjustWpmFromSwipe(delta: number) {
		this.adjustWpm(delta);
		this.showBriefWpmNotice(this.settings.reader.wpm);
	}

	private adjustFontSize(delta: number) {
		const newSize = Math.max(
			MIN_FONT_SIZE,
			Math.min(MAX_FONT_SIZE, this.settings.reader.fontSize + delta)
		);
		if (newSize === this.settings.reader.fontSize) {
			return;
		}

		this.settings = {
			...this.settings,
			reader: { ...this.settings.reader, fontSize: newSize }
		};
		this.applyFontSize();
		this.applyContextLineFontSize();
		new Notice(`Font size: ${newSize}px`);
	}

	private render() {
		const state = this.state;
		if (!state || !this.wordDisplayEl) {
			this.header?.update(state);
			this.syncMobileChrome(state);
			return;
		}

		if (state.finished && this.settings.reader.autoCloseOnCompletion) {
			window.setTimeout(() => this.forceClose(), 400);
		}

		this.wordContainer?.toggleClass('is-line-by-line', state.playbackMode === 'lineByLine');
		this.renderWord(state);
		this.header?.update(state);
		this.controlBar?.update(state, this.getDocumentProgressPercent(state));
		const showPauseContextInFocus =
			this.focusMode && !state.isPlaying && !state.finished;
		const showContext =
			this.settings.reader.display.showContext || showPauseContextInFocus;
		const onReadingSurface = this.mobileReader
			? isMobileReadingRoot(this.mobileRoute)
			: this.activeTab === 'home';
		this.contextLine?.setVisible(onReadingSurface && showContext);
		this.contextLine?.render(state, this.engine, showContext);
		this.renderSectionVisibility();
		this.sectionNav?.updateFromState(state);
		this.chapterNav?.updateFromState(state);
		this.syncMobileChrome(state);
		if (this.mobileReader ? this.mobileRoute === 'bookmarks' : this.activeTab === 'bookmarks') {
			this.refreshBookmarksPaneContext(state);
		}
	}

	private syncMobileChrome(state: ReaderState | null) {
		if (!this.mobileReader || !this.shellEl) {
			return;
		}
		const isReadingRoot = isMobileReadingRoot(this.mobileRoute);
		const playing = Boolean(state?.isPlaying && !state.finished && isReadingRoot);
		if (playing) {
			this.closeMobileOverlays();
		}
		syncMobilePlayingState(
			this.shellEl,
			playing,
			this.isMobileOverlayOpen(),
			this.containerEl
		);
		syncMobilePausedState(this.shellEl, !playing && isReadingRoot);
		syncMobileProgressStrip(
			this.mobileProgressStripEl,
			playing || !isReadingRoot ? null : state,
			this.settings.reader.display.showProgress
		);
		if (this.mobileCompactBar && state) {
			this.mobileCompactBar.update(state, this.settings);
			this.mobileCompactBar.setChapterNavVisible(this.canNavigateSections());
			this.mobileCompactBar.setVisible(!playing && isReadingRoot);
		}
		this.mobileActionBar?.setVisible(!playing && isReadingRoot);
	}

	private mountMobileGesturesIfNeeded() {
		if (!this.mobileReader || this.mobileGestures || this.readerOpen.kind === 'preferences') {
			return;
		}
		this.mobileGestures = mountMobileGestures(
			this.wordContainer,
			null,
			this.contextLine.getRootEl(),
			{
				onTapWordArea: () => {
					if (this.isDictionaryOverlayVisible()) {
						this.dismissDictionaryOverlayIfVisible();
						this.refocusContent();
						return;
					}
					this.toggleReaderPlayPause();
					this.refocusContent();
				},
				onDoubleTapLeft: () => {
					this.flashSkipEdge('left');
					this.handleArrowLeft();
				},
				onDoubleTapRight: () => {
					this.flashSkipEdge('right');
					this.handleArrowRight();
				},
				onLongPressWord: () => {
					void this.wordLookupHandlers?.lookupCurrentWord();
				},
				onTapContextWord: (word) => {
					void this.wordLookupHandlers?.lookupWord(word);
				},
				onSwipeLeft: () => this.handleArrowLeft(),
				onSwipeRight: () => this.handleArrowRight(),
				onSwipeChapterLeft: () => this.handleShiftArrowLeft(),
				onSwipeChapterRight: () => this.handleShiftArrowRight(),
				onEdgeHoldStart: (side) => this.startEdgeScrub(side),
				onEdgeHoldEnd: () => this.stopEdgeScrub(),
				onSwipeUp: () => this.adjustWpmFromSwipe(25),
				onSwipeDown: () => this.adjustWpmFromSwipe(-25),
				isBlocked: () => {
					if (!this.interSectionOverlayEl?.hasClass('is-hidden')) {
						return true;
					}
					if (!this.prepareOverlayEl?.hasClass('is-hidden')) {
						return true;
					}
					return (
						this.mobileMenuOpen ||
						this.mobileCoachOpen ||
						this.isDictionaryOverlayVisible()
					);
				},
				isHomeActive: () => isMobileReadingRoot(this.mobileRoute),
				isPlaying: () =>
					Boolean(this.state?.isPlaying && !this.state.finished)
			}
		);
	}

	private mountMobileCoachMarksIfNeeded() {
		if (!this.mobileReader || this.mobileCoachMarks || this.readerOpen.kind === 'preferences') {
			return;
		}
		this.mobileCoachMarks = mountMobileCoachMarks(this.shellEl, (open) => {
			this.mobileCoachOpen = open;
		});
	}

	private async createMobileBookmark(): Promise<void> {
		await this.bookmarkHandlers?.createBookmark();
		if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
			navigator.vibrate(10);
		}
	}

	private startEdgeScrub(side: EdgeSide) {
		this.stopEdgeScrub();
		this.edgeHoldSide = side;
		this.edgeScrubTickCount = 0;
		this.shellEl.removeClass('speed-reader-ai-mobile-edge-hold-left');
		this.shellEl.removeClass('speed-reader-ai-mobile-edge-hold-right');
		this.shellEl.addClass(
			side === 'left'
				? 'speed-reader-ai-mobile-edge-hold-left'
				: 'speed-reader-ai-mobile-edge-hold-right'
		);
		this.runEdgeScrubTick();
	}

	private runEdgeScrubTick() {
		if (this.edgeHoldSide === null) {
			return;
		}
		if (this.edgeHoldSide === 'left') {
			this.handleArrowLeft();
		} else {
			this.handleArrowRight();
		}
		this.edgeScrubTickCount += 1;
		const delay =
			this.edgeScrubTickCount <= 2 ? 150 : this.edgeScrubTickCount <= 5 ? 100 : 50;
		this.edgeScrubTimer = window.setTimeout(() => this.runEdgeScrubTick(), delay);
	}

	private stopEdgeScrub() {
		if (this.edgeScrubTimer !== null) {
			window.clearTimeout(this.edgeScrubTimer);
			this.edgeScrubTimer = null;
		}
		this.edgeHoldSide = null;
		this.edgeScrubTickCount = 0;
		this.shellEl.removeClass('speed-reader-ai-mobile-edge-hold-left');
		this.shellEl.removeClass('speed-reader-ai-mobile-edge-hold-right');
	}

	private flashSkipEdge(side: 'left' | 'right') {
		this.clearSkipFlash();
		const flash = this.wordContainer.createDiv({
			cls:
				side === 'left'
					? 'speed-reader-ai-mobile-skip-flash speed-reader-ai-mobile-skip-flash-left'
					: 'speed-reader-ai-mobile-skip-flash speed-reader-ai-mobile-skip-flash-right',
			text: side === 'left' ? '◀' : '▶'
		});
		this.skipFlashEl = flash;
		this.skipFlashTimer = window.setTimeout(() => this.clearSkipFlash(), 300);
	}

	private clearSkipFlash() {
		if (this.skipFlashTimer !== null) {
			window.clearTimeout(this.skipFlashTimer);
			this.skipFlashTimer = null;
		}
		this.skipFlashEl?.remove();
		this.skipFlashEl = null;
	}

	private onMobileChapterSelect(sectionId: string) {
		const profile = this.engine.getReaderUxProfile();
		if (profile?.sectionNav === false && this.engine.getStreamHeadings().length > 0) {
			this.engine.seekToHeading(sectionId);
		} else if (this.engine.getSectionList().some((s) => s.id === sectionId)) {
			this.jumpToSection(sectionId);
		} else {
			const wordIndex = Number.parseInt(sectionId, 10);
			if (!Number.isNaN(wordIndex)) {
				this.engine.jumpToHeading(wordIndex);
			}
		}
		this.refocusContent();
	}

	private revokeCoverObjectUrl(): void {
		if (this.coverObjectUrl) {
			URL.revokeObjectURL(this.coverObjectUrl);
			this.coverObjectUrl = null;
		}
	}

	private isActiveBookCoverSection(state: ReaderState): boolean {
		if (this.readerOpen.kind !== 'book') {
			return false;
		}
		if (state.totalWords > 0) {
			return false;
		}
		const sectionIndex = state.currentSectionIndex ?? 0;
		const chapter = this.readerOpen.bookIndex.chapters[sectionIndex];
		return chapter?.isCover === true || (sectionIndex === 0 && chapter?.wordCount === 0);
	}

	private async renderBookCoverImage(container: HTMLElement): Promise<boolean> {
		if (this.readerOpen.kind !== 'book') {
			return false;
		}
		const coverPath = bookCacheCoverPath(
			this.bookCacheBase,
			this.readerOpen.bookIndex.docKey
		);
		try {
			const exists = await this.app.vault.adapter.exists(coverPath);
			if (!exists) {
				return false;
			}
			const bytes = await this.app.vault.adapter.readBinary(coverPath);
			this.revokeCoverObjectUrl();
			const blob = new Blob([bytes], { type: 'image/jpeg' });
			this.coverObjectUrl = URL.createObjectURL(blob);
			const wrap = container.createDiv({ cls: 'speed-reader-ai-cover-display' });
			wrap.createEl('img', {
				cls: 'speed-reader-ai-cover-image',
				attr: { src: this.coverObjectUrl, alt: 'Book cover' }
			});
			wrap.createDiv({
				cls: 'speed-reader-ai-cover-hint',
				text: 'Press → for next chapter'
			});
			return true;
		} catch {
			return false;
		}
	}

	private renderWord(state: ReaderState) {
		this.wordDisplayEl.empty();

		if (state.totalWords === 0 && !state.displayToken) {
			if (this.isActiveBookCoverSection(state)) {
				void this.renderBookCoverImage(this.wordDisplayEl).then((shown) => {
					if (!shown && this.wordDisplayEl.isConnected) {
						this.wordDisplayEl.empty();
						const empty = this.wordDisplayEl.createDiv({
							cls: 'speed-reader-ai-word-empty'
						});
						empty.setText('No text to display');
					}
				});
				return;
			}
			const empty = this.wordDisplayEl.createDiv({ cls: 'speed-reader-ai-word-empty' });
			empty.setText('No text to display');
			return;
		}

		if (state.finished) {
			const doneEl = this.wordDisplayEl.createDiv({ cls: 'speed-reader-ai-done' });
			doneEl.createSpan({ text: '✓', cls: 'speed-reader-ai-done-icon' });
			doneEl.createSpan({ text: 'Finished', cls: 'speed-reader-ai-done-text' });
			return;
		}

		if (state.displayToken && state.displayToken.kind !== 'word') {
			const tokenEl = this.wordDisplayEl.createDiv({ cls: 'speed-reader-ai-token-display' });
			tokenEl.setText(
				tokenDisplayLabel({
					kind: state.displayToken.kind,
					text: state.displayToken.text,
					alt: state.displayToken.alt
				})
			);
			tokenEl.toggleClass(
				'is-pause',
				state.displayToken.kind === 'pause' || state.displayToken.kind === 'section_break'
			);
			tokenEl.toggleClass('is-image', state.displayToken.kind === 'image');
			return;
		}

		if (state.chunk.length === 0) {
			const doneEl = this.wordDisplayEl.createDiv({ cls: 'speed-reader-ai-done' });
			doneEl.createSpan({ text: '✓', cls: 'speed-reader-ai-done-icon' });
			doneEl.createSpan({ text: 'Finished', cls: 'speed-reader-ai-done-text' });
			return;
		}

		const wordWrapper = this.wordDisplayEl.createDiv({ cls: 'speed-reader-ai-word' });
		const seekIndices = state.chunkSeekIndices ?? state.chunk.map((_, i) => state.currentIndex + i);
		for (let i = 0; i < state.chunk.length; i++) {
			const word = state.chunk[i]!;
			this.renderWordUnit(
				wordWrapper,
				word,
				state,
				seekIndices[i] ?? state.currentIndex + i,
				state.playbackMode === 'lineByLine' && i === state.chunk.length - 1
			);
		}
	}

	private renderWordUnit(
		parent: HTMLElement,
		word: WordData,
		state: ReaderState,
		seekIndex: number,
		isLineByLineLastWord = false
	) {
		const unit = parent.createSpan({ cls: 'speed-reader-ai-word-unit' });
		if (
			isLinePlaybackMode(state.playbackMode) &&
			state.lineStartSeekIndex !== undefined &&
			seekIndex === state.lineStartSeekIndex
		) {
			unit.addClass('is-line-start');
		}
		if (
			(state.playbackMode === 'lineByLine' && isLineByLineLastWord) ||
			(isLinePlaybackMode(state.playbackMode) &&
				state.lineEndSeekIndex !== undefined &&
				seekIndex === state.lineEndSeekIndex)
		) {
			unit.addClass('is-line-end');
		}

		if (state.playbackMode === 'lineByLine') {
			unit.createSpan({
				cls: 'speed-reader-ai-line-text',
				text: `${word.word}${word.punctuation}`
			});
			return;
		}

		const { before, orp, after } = splitWordForOrpDisplay(word.word, word.orpIndex);

		unit.createSpan({ cls: 'speed-reader-ai-left', text: before });
		unit.createSpan({ cls: 'speed-reader-ai-orp', text: orp });
		unit.createSpan({ cls: 'speed-reader-ai-right', text: `${after}${word.punctuation}` });
	}

	private renderSectionVisibility() {
		if (!this.sectionSelect) return;

		const profile = this.engine.getReaderUxProfile();
		const hasLegacyHeadings = this.engine.getHeadings().length > 0;
		const hasSections = this.engine.getSectionList().length > 0;
		const hasStreamHeadings = this.engine.getStreamHeadings().length > 0;
		const showPicker =
			this.readerOpen.kind === 'book'
				? false
				: this.readerOpen.kind === 'legacy'
					? hasLegacyHeadings
					: profile?.sectionNav
						? false
						: hasStreamHeadings || hasLegacyHeadings;

		this.headingSelectWrapper.toggleClass('is-hidden', !showPicker);
	}
}
