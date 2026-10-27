import { App, Modal, Notice } from 'obsidian';
import { RSVPEngine, type NavJump } from '../engine/rsvpEngine';
import { isLinePlaybackMode, getPlaybackModeLabel } from '../engine/playbackMode';
import { tokenDisplayLabel } from '../engine/manifestPlayback';
import { SettingsBackedLlmClient, describeActiveLlmBackend } from '../llm/createLlmClient';
import { getAiProvidersApi } from '../llm/aiProvidersBridge';
import type { LlmModelCatalog } from '../llm/llmModelCatalog';
import { createDefaultLlmModelCatalog } from '../llm/llmModelCatalog';
import type { ManifestStore } from '../store/ManifestStore';
import { HeadingInfo, PlaybackMode, ReaderState, SpeedReaderAiSettings, WordData } from '../types';
import type { PreparePromptSet } from '../llm/promptCatalog';
import type { ProcessingModeId } from '../types/processedDocument';
import { mountModePicker, type ModePickerHandle } from './modePicker';
import { mountVersionPicker, type VersionPickerHandle } from './versionPicker';
import {
	type PrepareControlsHandle,
	type PrepareUiStatus
} from './prepareControls';
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
import { writeTextToClipboard } from '../services/clipboard';
import { buildReaderContextPrompt } from './readerContextPrompt';
import { mountReaderHeader, type ReaderHeaderHandle } from './readerShell/readerHeader';
import { mountReaderControlBar, type ReaderControlBarHandle } from './readerShell/readerControlBar';
import { mountContextLine, type ContextLineHandle } from './readerShell/contextLine';
import {
	mountReaderTabDock,
	type ReaderTabDockHandle,
	type ReaderTabId
} from './readerShell/readerTabDock';
import { mountPrepareOverlay, type PrepareOverlayHandle } from './readerShell/prepareOverlay';
import {
	mountInterSectionOverlay,
	type InterSectionOverlayHandle
} from './readerShell/interSectionOverlay';
import { mountContentPane, type ContentPaneHandle } from './readerShell/panes/contentPane';
import { mountSettingsPane, type SettingsPaneHandle } from './readerShell/panes/settingsPane';
import { mountShortcutsPane, type ShortcutsPaneHandle } from './readerShell/panes/shortcutsPane';
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
	type MobileGesturesHandle
} from './readerShell/mobileGestures';
import {
	mountPlayingGestureBands,
	type PlayingGestureBandsHandle
} from './readerShell/playingGestureBands';
import {
	createEdgeScrubController,
	mountSkipFlash,
	type EdgeScrubHandle,
	type EdgeScrubSide,
	type SkipFlashHandle
} from './readerShell/edgeScrub';
import { mountNavStreak, type NavStreakHandle } from './readerShell/navStreak';
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
	popRouteStack,
	pushRouteStack,
	type MobileRoute
} from './readerShell/mobileNavigation';
import {
	resolveReaderBackAction,
	type ReaderBackAction
} from './readerShell/readerBackNavigation';
import {
	createReaderFocusController,
	type ReaderFocusHandle
} from './readerShell/readerFocusController';
import { setReaderImmersiveBlackout } from './readerShell/readerImmersiveBlackout';
import { registerReaderKeyboard } from './readerShell/readerKeyboard';
import {
	deriveDesktopChromeMode,
	shouldShowInitialReadingSetup,
	type DesktopReaderChromeMode
} from './readerShell/desktopChromeState';
import {
	mountDesktopReadingSetup,
	type DesktopReadingSetupHandle
} from './readerShell/desktopReadingSetup';
import {
	mountDesktopPausedControlSheet,
	type DesktopNavigationOption,
	type DesktopPausedControlSheetHandle
} from './readerShell/desktopPausedControlSheet';
import {
	isEligibleCanvasPauseTarget,
	mountDesktopPlayingHud,
	type DesktopPlayingHudHandle
} from './readerShell/desktopPlayingHud';
import {
	mountDesktopReaderDrawer,
	type DesktopReaderDrawerHandle
} from './readerShell/desktopReaderDrawer';

import {
	clampFontSize,
	clampWpm,
	createReaderAppearance,
	stepFontSize,
	type ReaderAppearanceHandle
} from './readerShell/readerAppearance';
import {
	clampTtsWpm,
	MAX_TTS_WPM,
	SpeechPlaybackController
} from '../services/speechPlaybackController';

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

export interface SpeedReaderAiModalOptions {
	readerOpen: SpeedReaderOpen;
	settings: SpeedReaderAiSettings;
	onSettingsChange: (settings: SpeedReaderAiSettings) => void;
	manifestStore?: ManifestStore;
	preparePrompts?: PreparePromptSet;
	onCacheCleared?: () => void | Promise<void>;
	onReaderClose?: () => void;
	llmModelCatalog?: LlmModelCatalog;
	bookCacheBase?: string;
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
	private activeTab: ReaderTabId = 'home';
	private state: ReaderState | null = null;
	private autoStartTimer: number | null = null;
	private readonly focusController: ReaderFocusHandle;
	private keyboardCleanup: (() => void) | null = null;

	private ownerDoc!: Document;
	private shellEl!: HTMLElement;
	private paneStackEl!: HTMLElement;
	private homePaneEl!: HTMLElement;
	private wordContainer!: HTMLElement;
	private wordDisplayEl!: HTMLElement;
	private header: ReaderHeaderHandle | null = null;
	private controlBar: ReaderControlBarHandle | null = null;
	private contextLine!: ContextLineHandle;
	private tabDock: ReaderTabDockHandle | null = null;
	private mobileCompactBar: MobileCompactBarHandle | null = null;
	private mobileActionBar: MobileActionBarHandle | null = null;
	private mobilePausedStackEl: HTMLElement | null = null;
	private mobileBottomSheet: MobileBottomSheetHandle | null = null;
	private mobileGestures: MobileGesturesHandle | null = null;
	private playingGestureBands: PlayingGestureBandsHandle | null = null;
	private mobileCoachMarks: MobileCoachMarksHandle | null = null;
	private mobileProgressStripEl: HTMLElement | null = null;
	private mobileMenuOpen = false;
	private mobileDictionaryOpen = false;
	private wasPlayingBeforeDictionary = false;
	private mobileCoachOpen = false;
	private readonly edgeScrub: EdgeScrubHandle = createEdgeScrubController({
		onStep: (side, count) =>
			side === 'left' ? this.handleScrubStepLeft(count) : this.handleScrubStepRight(count),
		setHoldSide: (side) => {
			this.shellEl.removeClass('speed-reader-ai-mobile-edge-hold-left');
			this.shellEl.removeClass('speed-reader-ai-mobile-edge-hold-right');
			if (side !== null) {
				this.shellEl.addClass(
					side === 'left'
						? 'speed-reader-ai-mobile-edge-hold-left'
						: 'speed-reader-ai-mobile-edge-hold-right'
				);
			}
		},
		schedule: (cb, ms) => window.setTimeout(cb, ms),
		clear: (timer) => window.clearTimeout(timer),
		now: () => Date.now()
	});
	private skipFlash: SkipFlashHandle | null = null;
	private navStreak: NavStreakHandle | null = null;
	private edgeScrubSide: EdgeScrubSide | null = null;
	private readonly mobileReader = isMobileReader();
	private mobileRoute: MobileRoute = 'reading';
	private mobileRouteStack: MobileRoute[] = ['reading'];
	private contentPane!: ContentPaneHandle;
	private bookmarksPane!: BookmarksPaneHandle;
	private bookmarkContextLines: BookmarkContextLine[] = [];
	private settingsPane!: SettingsPaneHandle;
	private shortcutsPane!: ShortcutsPaneHandle;
	private mobileMenuHubPane: MobileMenuHubPaneHandle | null = null;
	private modePickerHost!: HTMLElement;
	private versionPickerHost!: HTMLElement;
	private structuredBarEl!: HTMLElement;
	private headingSelectWrapper!: HTMLElement;
	private sectionSelect!: HTMLSelectElement;
	private interSectionOverlay: InterSectionOverlayHandle | null = null;
	private readonly appearance: ReaderAppearanceHandle;
	private readonly speechPlayback = new SpeechPlaybackController();
	private prepareOverlay: PrepareOverlayHandle | null = null;
	private desktopReadingSetup: DesktopReadingSetupHandle | null = null;
	private desktopPausedSheet: DesktopPausedControlSheetHandle | null = null;
	private desktopPlayingHud: DesktopPlayingHudHandle | null = null;
	private desktopDrawer: DesktopReaderDrawerHandle | null = null;
	private desktopChromeMode: DesktopReaderChromeMode = 'paused';
	private setupRequired = false;
	private setupRequested = false;
	private prepareStatus: PrepareUiStatus = 'idle';
	private wordContainerClickHandler: ((event: MouseEvent) => void) | null = null;

	private modePicker: ModePickerHandle | null = null;
	private versionPicker: VersionPickerHandle | null = null;
	private prepareControls: PrepareControlsHandle | null = null;
	private sectionNav: SectionNavControlsHandle | null = null;
	private chapterNav: ChapterNavControlsHandle | null = null;
	private coverObjectUrl: string | null = null;
	private readonly bookCacheBase: string;
	constructor(app: App, options: SpeedReaderAiModalOptions) {
		super(app);
		const {
			readerOpen,
			settings,
			onSettingsChange,
			manifestStore,
			preparePrompts,
			onCacheCleared,
			onReaderClose,
			llmModelCatalog = createDefaultLlmModelCatalog(),
			bookCacheBase = ''
		} = options;
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
		this.focusController = createReaderFocusController({
			getDoc: () => this.ownerDoc ?? this.containerEl.ownerDocument,
			contentEl: this.contentEl,
			containerEl: this.containerEl,
			isMobile: this.mobileReader,
			workspace: this.app.workspace,
			isPlaying: () => this.state?.isPlaying ?? false,
			pause: () => this.engine.pause(),
			play: () => this.engine.play(),
			beforeEnterFocus: () => {
				if (this.activeTab !== 'home') {
					this.setActiveTab('home');
				}
			},
			render: () => this.render()
		});
		this.appearance = createReaderAppearance(
			{
				containerEl: this.containerEl,
				contentEl: this.contentEl,
				getWordContainer: () => this.wordContainer ?? null,
				getContextLineRootEl: () => this.contextLine?.getRootEl() ?? null
			},
			() => this.settings
		);
		this.engine = new RSVPEngine(
			this.settings,
			(state) => {
				const previousIsPlaying = this.previousIsPlaying;
				this.state = state;
				this.previousIsPlaying = state.isPlaying;
				this.syncDesktopFocusWithPlayback(state, previousIsPlaying);
				this.speechPlayback.sync(
					state,
					this.settings.reader.ttsEnabled,
					this.settings.reader.ttsVoiceUri
				);
				this.sessionHooks?.onEngineStateChange?.(state, previousIsPlaying);
				this.render();
			},
			() => {
				this.render();
			},
			() => this.handleSectionComplete()
		);
		this.engine.setSectionNavLabel(this.readerOpen.kind === 'book' ? 'Chapter' : 'Section');
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

		this.appearance.applyTheme();
		this.appearance.applyFontFamily();

		this.shellEl = contentEl.createDiv({ cls: 'speed-reader-ai-shell' });

		if (!this.usesAdaptiveDesktopChrome()) {
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
		}

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
		this.appearance.applyFontSize();
		this.appearance.applyContextLineFontSize();
		this.appearance.applyCenterGuideVisibility();

		this.wordDisplayEl = this.wordContainer.createDiv({ cls: 'speed-reader-ai-word-display' });
		if (this.usesAdaptiveDesktopChrome()) {
			this.wordContainerClickHandler = (event) => {
				if (!this.state?.isPlaying || this.desktopChromeMode !== 'playing') {
					return;
				}
				const selection = this.ownerDoc.getSelection()?.toString() ?? '';
				if (isEligibleCanvasPauseTarget(event.target, this.wordContainer, selection)) {
					this.engine.pause();
				}
			};
			this.wordContainer.addEventListener('click', this.wordContainerClickHandler);
		}
		this.skipFlash = mountSkipFlash(this.wordContainer);
		this.navStreak = mountNavStreak(this.wordContainer);
		this.interSectionOverlay = mountInterSectionOverlay(this.wordContainer);
		this.prepareOverlay = mountPrepareOverlay(this.wordContainer);
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
		if (this.usesAdaptiveDesktopChrome()) {
			this.desktopReadingSetup = mountDesktopReadingSetup(this.homePaneEl, {
				onReadLocally: () => this.onReadWithoutAi(),
				onPrepareWithAi: () => this.onPrepareWithAi(),
				onClearCache: () => this.onClearDocumentCache()
			});
			this.modePickerHost = this.desktopReadingSetup.getModeHost();
			this.versionPickerHost = this.desktopReadingSetup.getVersionHost();
		} else {
			this.modePickerHost = this.structuredBarEl.createDiv({
				cls: 'speed-reader-ai-mode-picker-host'
			});
			this.versionPickerHost = this.structuredBarEl.createDiv({
				cls: 'speed-reader-ai-version-picker-host'
			});
		}
		this.headingSelectWrapper = this.structuredBarEl.createDiv({
			cls: 'speed-reader-ai-section-select-wrapper is-hidden'
		});
		this.sectionSelect = this.headingSelectWrapper.createEl('select', {
			cls: 'speed-reader-ai-section-select'
		});
		this.sectionSelect.addEventListener('change', () => this.onHeadingSelectChange());

		let auxiliaryPaneParent = this.paneStackEl;
		if (this.usesAdaptiveDesktopChrome()) {
			this.desktopDrawer = mountDesktopReaderDrawer(this.paneStackEl, () => {
				this.setActiveTab('home');
			});
			auxiliaryPaneParent = this.desktopDrawer.getBodyEl();
		}

		this.contentPane = mountContentPane(auxiliaryPaneParent, { isMobile: this.mobileReader });
		this.bookmarksPane = mountBookmarksPane(auxiliaryPaneParent, { isMobile: this.mobileReader });
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
		this.settingsPane = mountSettingsPane(auxiliaryPaneParent, this.settings, {
			onChange: (mutate) => {
				const next = structuredClone(this.settings);
				mutate(next);
				this.persistSettings(next);
			},
			isMobile: this.mobileReader
		});
		this.settingsPane.onSwipeBack(() => {
			this.popMobileRoute();
		});
		this.shortcutsPane = mountShortcutsPane(auxiliaryPaneParent, {
			isMobile: this.mobileReader,
			showGestures: this.mobileReader
		});
		this.shortcutsPane.onSwipeBack(() => {
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

		if (this.usesAdaptiveDesktopChrome()) {
			this.desktopPausedSheet = mountDesktopPausedControlSheet(this.shellEl, {
				onPlayPause: () => this.toggleReaderPlayPause(),
				onWpmDelta: (delta) => this.adjustWpm(delta),
				onFontDelta: (delta) => this.adjustFontSize(delta),
				onPlaybackModeChange: (mode) => this.setPlaybackMode(mode),
				onPreviousSection: () => this.navigateToAdjacentSection(-1),
				onNextSection: () => this.navigateToAdjacentSection(1),
				onNavigate: (id) => this.navigateFromDesktopSheet(id),
				onTtsToggle: () => this.toggleTts(),
				onBookmark: () => void this.bookmarkHandlers?.createBookmark(),
				onCopyContext: () => this.copyCurrentParagraphContextPrompt(),
				onOpenSetup: () => this.openDesktopReadingSetup(),
				onOpenContent: () => this.openDesktopDrawer('content'),
				onOpenBookmarks: () => this.showBookmarkPicker(),
				onOpenShortcuts: () => this.openDesktopDrawer('shortcuts'),
				onOpenSettings: () => this.openDesktopDrawer('settings')
			});
			this.desktopPlayingHud = mountDesktopPlayingHud(this.shellEl, () => this.engine.pause());
		} else {
			this.controlBar = mountReaderControlBar(
				this.shellEl,
				this.settings,
				{
					onWpmDelta: (delta) => this.adjustWpm(delta),
					onFontDelta: (delta) => this.adjustFontSize(delta),
					onPlaybackModeChange: (mode) => this.setPlaybackMode(mode),
					onCopyContext: () => this.copyCurrentParagraphContextPrompt(),
					onTtsToggle: () => this.toggleTts(),
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
		}

		if (this.mobileReader && this.readerOpen.kind !== 'preferences') {
			this.mobileActionBar = mountMobileActionBar(this.mobilePausedStackEl!);
			this.mobileActionBar.onBookmark(() => {
				void this.createMobileBookmark();
			});
			this.mobileActionBar.onBookmarkExplorer(() => {
				void this.bookmarkHandlers?.openBookmarksTab();
			});
			this.mobileActionBar.onCopyContext(() => {
				void this.copyCurrentParagraphContextPrompt();
			});
			this.mobileActionBar.onDefine(() => {
				void this.wordLookupHandlers?.lookupCurrentWord();
			});
			this.mobileActionBar.onTtsToggle(() => this.toggleTts());
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
		} else if (!this.usesAdaptiveDesktopChrome()) {
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
			if (this.usesAdaptiveDesktopChrome()) {
				this.setupRequired = shouldShowInitialReadingSetup({
					isStructured: true,
					hasResumePosition: Boolean(this.readerOpen.resumePosition),
					activeVersionStatus: this.session.modeStatus(),
					hasPreferredAiVersion: Boolean(this.readerOpen.preferredAiVersionId)
				});
			}
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
		this.controlBar?.setPrepareVisible(this.readerOpen.kind === 'structured');
		this.prepareControls = this.controlBar?.getPrepareControls() ?? null;
		this.setActiveTab('home');
		this.registerKeyboardHandlers();
		this.focusController.register();
		this.mountMobileGesturesIfNeeded();
		this.mountPlayingGestureBandsIfNeeded();
		this.mountMobileCoachMarksIfNeeded();
		this.updateModeSpecificUi();
		if (!this.setupRequired) {
			this.scheduleAutoStart();
		}
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
		if (this.focusController.hasFocusChrome()) {
			this.focusController.setFocusMode(false);
		}
		this.clearAutoStartTimer();
		this.speechPlayback.destroy();
		this.revokeCoverObjectUrl();
		this.bookmarkHandlers = null;
		this.wordLookupHandlers = null;
		this.dictionaryOverlay?.dismiss();
		this.dictionaryOverlay = null;
		this.mobileDictionarySheet?.destroy();
		this.mobileDictionarySheet = null;
		this.interSectionOverlay?.destroy();
		this.interSectionOverlay = null;
		this.prepareOverlay?.destroy();
		this.prepareOverlay = null;
		this.desktopReadingSetup?.destroy();
		this.desktopReadingSetup = null;
		this.desktopPausedSheet?.destroy();
		this.desktopPausedSheet = null;
		this.desktopPlayingHud?.destroy();
		this.desktopPlayingHud = null;
		this.desktopDrawer?.destroy();
		this.desktopDrawer = null;
		this.modePicker?.destroy();
		this.versionPicker?.destroy();
		this.prepareControls?.destroy();
		this.sectionNav?.destroy();
		this.chapterNav?.destroy();
		this.header?.destroy();
		this.header = null;
		this.controlBar?.destroy();
		this.controlBar = null;
		this.contextLine?.destroy();
		this.tabDock?.destroy();
		this.mobileCompactBar?.destroy();
		this.mobileActionBar?.destroy();
		this.mobileBottomSheet?.destroy();
		this.mobileGestures?.destroy();
		this.playingGestureBands?.destroy();
		this.playingGestureBands = null;
		this.edgeScrub.stop();
		this.skipFlash?.destroy();
		this.skipFlash = null;
		this.navStreak?.destroy();
		this.navStreak = null;
		if (this.wordContainerClickHandler && this.wordContainer) {
			this.wordContainer.removeEventListener('click', this.wordContainerClickHandler);
		}
		this.wordContainerClickHandler = null;
		this.mobileCoachMarks?.destroy();
		this.mobileCoachMarks = null;
		removeMobileShellClass(this.shellEl, this.containerEl);
		setReaderImmersiveBlackout(this.ownerDoc ?? this.containerEl.ownerDocument, this.containerEl, false);
		this.contentPane?.destroy();
		this.bookmarksPane?.destroy();
		this.settingsPane?.destroy();
		this.shortcutsPane?.destroy();
		this.mobileMenuHubPane?.destroy();
		this.mobileMenuHubPane = null;
		this.focusController.unregister();
		this.keyboardCleanup?.();
		this.keyboardCleanup = null;
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
		void this.bookmarkHandlers?.openBookmarksTab();
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

	private buildContextPromptSourceTitle(): string {
		if (this.readerOpen.kind === 'book') {
			return this.readerOpen.bookIndex.title || this.readerOpen.sourcePath.split('/').pop() || 'Book';
		}
		if (this.readerOpen.kind === 'structured') {
			return this.readerOpen.sourcePath.split('/').pop()?.replace(/\.md$/i, '') || 'Note';
		}
		if (this.readerOpen.kind === 'legacy') {
			return 'Selected text';
		}
		return 'Reading';
	}

	private buildContextPromptMetadata(state: ReaderState | null): {
		sourceKind: string;
		chapterLabel?: string;
		chapterTitle?: string;
		sectionProgressLabel?: string;
	} {
		if (this.readerOpen.kind === 'book') {
			const chapterNumber =
				typeof state?.currentSectionIndex === 'number' ? state.currentSectionIndex + 1 : undefined;
			const chapterCount = state?.sectionCount;
			const chapterLabel =
				typeof chapterNumber === 'number'
					? `Chapter ${chapterNumber}${typeof chapterCount === 'number' && chapterCount > 0 ? ` of ${chapterCount}` : ''}`
					: 'Book';
			return {
				sourceKind: 'Book',
				chapterLabel,
				chapterTitle: state?.sectionTitle?.trim() || undefined,
				sectionProgressLabel:
					typeof chapterNumber === 'number'
						? `Chapter ${chapterNumber}${typeof chapterCount === 'number' && chapterCount > 0 ? ` of ${chapterCount}` : ''}`
						: undefined
			};
		}

		if (this.readerOpen.kind === 'structured') {
			const sectionNumber =
				typeof state?.currentSectionIndex === 'number' ? state.currentSectionIndex + 1 : undefined;
			const sectionCount = state?.sectionCount;
			return {
				sourceKind: 'Note',
				chapterLabel:
					typeof sectionNumber === 'number'
						? `Section ${sectionNumber}${typeof sectionCount === 'number' && sectionCount > 0 ? ` of ${sectionCount}` : ''}`
						: undefined,
				chapterTitle: state?.sectionTitle?.trim() || undefined,
				sectionProgressLabel:
					typeof sectionNumber === 'number'
						? `Section ${sectionNumber}${typeof sectionCount === 'number' && sectionCount > 0 ? ` of ${sectionCount}` : ''}`
						: undefined
			};
		}

		if (this.readerOpen.kind === 'legacy') {
			return {
				sourceKind: 'Selected text'
			};
		}

		return {
			sourceKind: 'Reading'
		};
	}

	private async copyCurrentParagraphContextPrompt(): Promise<void> {
		if (this.readerOpen.kind === 'preferences') {
			new Notice('Open a document before copying paragraph context.');
			return;
		}

		const snapshot = this.engine.getBookmarkContextSnapshot();
		const currentLine = snapshot.lines[snapshot.currentLineIndex];
		if (!currentLine) {
			new Notice('No paragraph context is available yet.');
			return;
		}

		const currentParagraphIndex = currentLine.paragraphIndex;
		const previousParagraphs: string[] = [];
		for (let paragraphIndex = Math.max(0, currentParagraphIndex - 3); paragraphIndex < currentParagraphIndex; paragraphIndex++) {
			const paragraphText = this.engine.getParagraphTextForParagraphIndex(paragraphIndex).trim();
			if (paragraphText.length > 0) {
				previousParagraphs.push(paragraphText);
			}
		}

		const currentParagraph = this.engine
			.getParagraphTextForParagraphIndex(currentParagraphIndex)
			.trim();
		if (!currentParagraph) {
			new Notice('No paragraph context is available yet.');
			return;
		}
		const metadata = this.buildContextPromptMetadata(this.state);

		const prompt = buildReaderContextPrompt({
			sourceTitle: this.buildContextPromptSourceTitle(),
			sourceKind: metadata.sourceKind,
			chapterLabel: metadata.chapterLabel,
			chapterTitle: metadata.chapterTitle,
			sectionProgressLabel: metadata.sectionProgressLabel,
			currentParagraph,
			previousParagraphs
		});

		try {
			await writeTextToClipboard(prompt, this.ownerDoc);
			new Notice('Paragraph context prompt copied to clipboard.');
		} catch (error) {
			console.error('speed-reader-ai: failed to copy paragraph context prompt', error);
			new Notice('Could not copy paragraph context prompt.');
		}
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
		this.mobileRouteStack = pushRouteStack(this.mobileRouteStack, 'reading');
		this.applyMobileRoute('reading');
		this.refocusContent();
	}

	private popMobileRoute(): void {
		if (this.mobileRouteStack.length <= 1) {
			this.goToReadingRoot();
			return;
		}
		const { stack, route } = popRouteStack(this.mobileRouteStack);
		this.mobileRouteStack = stack;
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
		this.mobileRouteStack = pushRouteStack(this.mobileRouteStack, route);
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
		if (route === 'bookmarks') {
			void this.refreshBookmarksPaneData();
		}
		if (isReading) {
			this.refocusContent();
		}
	}

	private usesAdaptiveDesktopChrome(): boolean {
		return !this.mobileReader && this.readerOpen.kind !== 'preferences';
	}

	private openDesktopDrawer(tab: Exclude<ReaderTabId, 'home'>): void {
		if (!this.usesAdaptiveDesktopChrome()) {
			this.setActiveTab(tab);
			return;
		}
		this.engine.pause();
		this.setActiveTab(tab);
	}

	private openDesktopReadingSetup(): void {
		if (!this.usesAdaptiveDesktopChrome() || this.readerOpen.kind !== 'structured') {
			return;
		}
		this.engine.pause();
		this.setActiveTab('home');
		this.setupRequested = true;
		this.clearAutoStartTimer();
		this.render();
	}

	private getDesktopNavigationState(): {
		label: string;
		options: DesktopNavigationOption[];
		currentId: string | null;
		canStep: boolean;
	} {
		const state = this.state;
		const sections = this.engine.getSectionList();
		if (sections.length > 0) {
			const noun = this.readerOpen.kind === 'book' ? 'Chapter' : 'Section';
			return {
				label: noun,
				options: sections.map((section, index) => ({
					id: section.id,
					label: `${index + 1} of ${sections.length} · ${section.title}`
				})),
				currentId: sections[state?.currentSectionIndex ?? 0]?.id ?? null,
				canStep: true
			};
		}

		const streamHeadings = this.engine.getStreamHeadings();
		if (streamHeadings.length > 0) {
			const currentTokenIndex = state?.currentTokenIndex ?? 0;
			let current = streamHeadings[0];
			for (const heading of streamHeadings) {
				if (heading.tokenIndex <= currentTokenIndex) {
					current = heading;
				}
			}
			return {
				label: 'Heading',
				options: streamHeadings.map((heading) => ({
					id: `token:${heading.tokenIndex}`,
					label: heading.title
				})),
				currentId: current ? `token:${current.tokenIndex}` : null,
				canStep: false
			};
		}

		const headings = this.engine.getHeadings();
		if (headings.length > 0) {
			const currentWordIndex = state?.currentIndex ?? 0;
			let current = headings[0];
			for (const heading of headings) {
				if (heading.wordIndex <= currentWordIndex) {
					current = heading;
				}
			}
			return {
				label: 'Heading',
				options: headings.map((heading) => ({
					id: `word:${heading.wordIndex}`,
					label: heading.text
				})),
				currentId: current ? `word:${current.wordIndex}` : null,
				canStep: false
			};
		}

		return { label: 'Reading', options: [], currentId: null, canStep: false };
	}

	private navigateFromDesktopSheet(id: string): void {
		if (this.engine.getSectionList().some((section) => section.id === id)) {
			this.jumpToSection(id);
			return;
		}
		if (id.startsWith('token:')) {
			const tokenIndex = Number.parseInt(id.slice('token:'.length), 10);
			if (!Number.isNaN(tokenIndex)) {
				this.engine.seekToToken(tokenIndex);
				this.refocusContent();
			}
			return;
		}
		if (id.startsWith('word:')) {
			const wordIndex = Number.parseInt(id.slice('word:'.length), 10);
			if (!Number.isNaN(wordIndex)) {
				this.engine.jumpToHeading(wordIndex);
				this.refocusContent();
			}
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
		this.homePaneEl?.toggleClass('is-hidden', !isHome && !this.desktopDrawer);
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

		this.header?.setProgressVisible(isHome && this.settings.reader.display.showProgress);
		this.contextLine?.setVisible(isHome && this.settings.reader.display.showContext);
		this.controlBar?.setVisible(isHome && this.readerOpen.kind !== 'preferences');
		const drawerTitles: Partial<Record<ReaderTabId, string>> = {
			content: 'Contents',
			bookmarks: 'Bookmarks',
			settings: 'Preferences',
			shortcuts: 'Keyboard shortcuts'
		};
		this.desktopDrawer?.setVisible(!isHome, drawerTitles[tab]);
		this.shellEl?.toggleClass('is-preferences-only', this.readerOpen.kind === 'preferences');

		if (tab === 'settings') {
			this.settingsPane?.refresh(this.settings);
		}
		if (tab === 'bookmarks') {
			void this.refreshBookmarksPaneData();
		}
		if (isHome) {
			this.refocusContent();
		}
		if (this.usesAdaptiveDesktopChrome()) {
			this.render();
		}
	}

	private persistSettings(next: SpeedReaderAiSettings) {
		const normalizedNext = next.reader.ttsEnabled
			? {
					...next,
					reader: { ...next.reader, wpm: clampTtsWpm(next.reader.wpm) }
				}
			: next;
		this.settings = validateSettings(normalizedNext, this.llmModelCatalog);
		this.engine.setSettings(this.settings);
		this.appearance.applyAll();
		this.header?.setProgressVisible(this.settings.reader.display.showProgress);
		this.onSettingsChange(this.settings);
	}

	private toggleTts(): void {
		const enabled = !this.settings.reader.ttsEnabled;
		const speedWasLimited = enabled && this.settings.reader.wpm > MAX_TTS_WPM;
		const safeWpm = enabled ? clampTtsWpm(this.settings.reader.wpm) : this.settings.reader.wpm;
		this.settings = {
			...this.settings,
			reader: { ...this.settings.reader, ttsEnabled: enabled, wpm: safeWpm }
		};
		this.engine.setSettings(this.settings);
		if (speedWasLimited) {
			this.engine.adjustWpm(0);
		}
		this.controlBar?.setTtsEnabled(enabled);
		this.mobileActionBar?.setTtsEnabled(enabled);
		this.speechPlayback.sync(this.state, enabled, this.settings.reader.ttsVoiceUri);
		this.onSettingsChange(this.settings);
		new Notice(
			speedWasLimited
				? `Text to speech enabled · speed limited to ${MAX_TTS_WPM} WPM`
				: `Text to speech ${enabled ? 'enabled' : 'disabled'}`
		);
		this.render();
	}

	private scheduleAutoStart() {
		this.clearAutoStartTimer();
		if (this.readerOpen.kind === 'preferences') {
			return;
		}
		if (this.usesAdaptiveDesktopChrome() && (this.setupRequired || this.setupRequested)) {
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

	private toggleReaderPlayPause(): void {
		if (this.state?.isPlaying) {
			this.engine.togglePlayPause();
			return;
		}
		this.startPlayback();
	}

	private startPlayback(): void {
		if (this.usesAdaptiveDesktopChrome() && (this.setupRequired || this.setupRequested)) {
			return;
		}
		this.engine.play();
	}

	private syncDesktopFocusWithPlayback(
		state: ReaderState,
		previousIsPlaying: boolean | null
	): void {
		if (
			this.mobileReader ||
			this.readerOpen.kind === 'preferences' ||
			previousIsPlaying === null ||
			previousIsPlaying === state.isPlaying
		) {
			return;
		}

		this.focusController.setFocusMode(state.isPlaying && !state.finished);
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

		if (!this.usesAdaptiveDesktopChrome()) {
			const sectionHost = this.structuredBarEl.createDiv({ cls: 'speed-reader-ai-section-nav-host' });
			this.sectionNav = mountSectionNavControls(sectionHost, this.engine, {
				onPrevSection: () => this.navigateToAdjacentSection(-1),
				onNextSection: () => this.navigateToAdjacentSection(1),
				onJumpToSection: (id) => this.jumpToSection(id)
			});
			this.structuredBarEl.removeClass('is-hidden');
		}
	}

	private mountBookControls() {
		if (this.usesAdaptiveDesktopChrome()) {
			return;
		}
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
		if (this.usesAdaptiveDesktopChrome() && kind === 'ai') {
			this.setupRequired = false;
			this.setupRequested = false;
		}
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
		const leavingSetup = this.setupRequired || this.setupRequested;
		this.session.loadDeterministic(this.engine, this.session.activeModeId);
		this.prepareStatus = 'deterministic';
		this.prepareControls?.setStatus(this.prepareStatus);
		this.desktopReadingSetup?.setStatus(this.prepareStatus);
		this.setupRequired = false;
		this.setupRequested = false;
		this.rebuildHeadingSelector();
		this.sectionNav?.refresh();
		this.updateModeSpecificUi();
		if (leavingSetup) {
			this.scheduleAutoStart();
		}
	}

	private async onClearDocumentCache() {
		if (!this.session) return;
		const confirmed = this.ownerDoc.defaultView?.confirm(
			'Remove AI prepare cache for this note? You can prepare again later.'
		) ?? false;
		if (!confirmed) return;

		const removed = await this.session.clearCache(this.engine);
		this.syncPrepareStatus('deterministic');
		this.setupRequired = this.usesAdaptiveDesktopChrome();
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
		this.prepareStatus = 'preparing';
		this.prepareControls?.setPreparing(true);
		this.desktopReadingSetup?.setPreparing(true);
		if (!this.usesAdaptiveDesktopChrome()) {
			this.prepareOverlay?.show();
		}
		this.render();
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
						this.prepareOverlay?.update(
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
			this.setupRequired = false;
			this.setupRequested = false;
			this.rebuildHeadingSelector();
			this.sectionNav?.refresh();
			this.updateModeSpecificUi();
			void this.onCacheCleared?.();
		} catch (e: unknown) {
			this.prepareStatus = 'error';
			this.prepareControls?.setStatus(this.prepareStatus);
			this.desktopReadingSetup?.setStatus(this.prepareStatus);
			const message = e instanceof Error ? e.message : String(e);
			new Notice(
				`Prepare failed: ${message}. Check LLM backend (${describeActiveLlmBackend(this.settings)}) in plugin settings.`
			);
		} finally {
			this.prepareControls?.setPreparing(false);
			this.desktopReadingSetup?.setPreparing(false);
			this.prepareOverlay?.hide();
			this.render();
		}
	}

	private syncPrepareStatus(kind: 'ai' | 'deterministic') {
		if (!this.session) return;
		const modeStatus = this.session.modeStatus();
		if (modeStatus === 'stale') {
			this.prepareStatus = 'stale';
		} else if (kind === 'ai') {
			this.prepareStatus = 'prepared';
		} else {
			this.prepareStatus = 'deterministic';
		}
		this.prepareControls?.setStatus(this.prepareStatus);
		this.desktopReadingSetup?.setStatus(this.prepareStatus);
	}

	private updateModeSpecificUi() {
		const profile = this.engine.getReaderUxProfile();
		const isStructured = this.readerOpen.kind === 'structured';
		const isBook = this.readerOpen.kind === 'book';
		const hideStructuredBar =
			(!isStructured && !isBook) || this.mobileReader || this.usesAdaptiveDesktopChrome();
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
		this.interSectionOverlay?.show(nextLabel, nextTitle, () => {
			this.engine.nextSection();
			this.notifySectionChange();
			this.startPlayback();
		});
		this.render();
	}

	private isInputBlockedByOverlay(): boolean {
		if (
			this.usesAdaptiveDesktopChrome() &&
			(this.desktopChromeMode === 'setup' || this.activeTab !== 'home')
		) {
			return true;
		}
		if (this.interSectionOverlay?.isVisible() ?? true) {
			return true;
		}
		if (this.prepareOverlay?.isVisible() ?? true) {
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
			focusMode: this.focusController.isFocusMode()
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
				this.focusController.setFocusMode(false);
				break;
			case 'close-modal':
				this.forceClose();
				break;
		}
	}

	private handleReaderBack(): boolean {
		if (this.usesAdaptiveDesktopChrome() && this.setupRequested && !this.setupRequired) {
			this.setupRequested = false;
			this.render();
			return true;
		}
		const action = resolveReaderBackAction(this.buildBackSnapshot());
		if (action === 'close-modal') {
			return false;
		}
		this.executeReaderBackAction(action);
		return true;
	}

	private dismissDictionaryOverlayIfVisible(): boolean {
		if (!this.isDictionaryOverlayVisible()) {
			return false;
		}
		this.dismissDictionaryUi(true);
		this.refocusContent();
		return true;
	}

	private registerKeyboardHandlers() {
		this.keyboardCleanup = registerReaderKeyboard(this.scope, this.contentEl, {
			isBlocked: () => this.isInputBlockedByOverlay(),
			isDictionaryVisible: () => this.isDictionaryOverlayVisible(),
			dismissDictionaryIfVisible: () => this.dismissDictionaryOverlayIfVisible(),
			togglePlayPause: () => this.toggleReaderPlayPause(),
			arrowLeft: () => this.handleArrowLeft(),
			arrowRight: () => this.handleArrowRight(),
			sectionPrev: () => this.handleShiftArrowLeft(),
			sectionNext: () => this.handleShiftArrowRight(),
			adjustWpm: (delta) => this.adjustWpm(delta),
			adjustFontSize: (delta) => this.adjustFontSize(delta),
			toggleFocusMode: () =>
				this.focusController.setFocusMode(!this.focusController.isFocusMode()),
			togglePlaybackMode: () => {
				this.engine.togglePlaybackMode();
				this.render();
			},
			createBookmark: () => void this.bookmarkHandlers?.createBookmark(),
			openBookmarksTab: () => void this.bookmarkHandlers?.openBookmarksTab(),
			lookupCurrentWord: () => void this.wordLookupHandlers?.lookupCurrentWord(),
			back: () => this.handleReaderBack(),
			forceClose: () => this.forceClose()
		});
	}

	private handleArrowLeft() {
		if (this.state && isLinePlaybackMode(this.state.playbackMode)) {
			this.engine.prevLine();
		} else {
			this.playNavStreak(this.engine.rewindSmart());
		}
		this.refocusContent();
	}

	private handleArrowRight() {
		if (this.state && isLinePlaybackMode(this.state.playbackMode)) {
			this.engine.nextLine();
		} else {
			this.playNavStreak(this.engine.fastForwardSmart());
		}
		this.refocusContent();
	}

	/** Flick the skipped words past the display so a jump reads as travel. */
	private playNavStreak(jump: NavJump | null) {
		if (!jump) {
			return;
		}
		this.navStreak?.play(jump.words, jump.direction);
	}

	/** Paused swipe navigation: move one sentence (context line) backward. */
	private handleSentencePrev() {
		this.engine.prevSentence();
		this.refocusContent();
	}

	/** Paused swipe navigation: move one sentence (context line) forward. */
	private handleSentenceNext() {
		this.engine.nextSentence();
		this.refocusContent();
	}

	/** Token/word steps — used for continuous edge scrub while holding. */
	private handleScrubStepLeft(count = 1) {
		this.engine.rewind(count);
	}

	/**
	 * Releasing a backward scrub lands on a sentence start, never mid-sentence —
	 * the same contract as every other backward move.
	 */
	private handleScrubEnd(side: EdgeScrubSide) {
		this.edgeScrub.stop();
		if (side === 'left') {
			this.playNavStreak(this.engine.snapToSentenceStart());
		}
	}

	private handleScrubStepRight(count = 1) {
		this.engine.fastForward(count);
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

	private refocusContent() {
		this.focusController.refocusContent();
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

	private adjustWpm(delta: number, options?: { quiet?: boolean }) {
		const currentWpm = this.settings.reader.wpm;
		const requestedWpm = currentWpm + delta;
		const targetWpm = this.settings.reader.ttsEnabled
			? clampTtsWpm(requestedWpm)
			: requestedWpm;
		const newWpm = this.engine.adjustWpm(targetWpm - currentWpm);
		this.settings = {
			...this.settings,
			reader: { ...this.settings.reader, wpm: newWpm }
		};
		this.engine.setSettings(this.settings);
		if (!options?.quiet) {
			new Notice(`Speed: ${newWpm} WPM`);
		}
		return newWpm;
	}

	private adjustWpmFromPlayingBand(delta: number) {
		const newWpm = this.adjustWpm(delta, { quiet: true });
		this.playingGestureBands?.showSpeedLabel(newWpm);
	}

	showContinuousReadingMilestone(elapsedMs: number): void {
		const minutes = Math.max(1, Math.floor(elapsedMs / 60_000));
		this.playingGestureBands?.showBannerMessage(
			`Nice. You have read continuously for ${minutes} min.`,
			'milestone'
		);
	}

	showReadingHabitLogged(): void {
		this.playingGestureBands?.showBannerMessage('Logged reading', 'milestone');
	}

	private setReaderWpm(wpm: number) {
		const clamped = this.settings.reader.ttsEnabled
			? clampTtsWpm(clampWpm(wpm))
			: clampWpm(wpm);
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
		const clamped = clampFontSize(fontSize);
		if (clamped === this.settings.reader.fontSize) {
			return;
		}
		this.settings = {
			...this.settings,
			reader: { ...this.settings.reader, fontSize: clamped }
		};
		this.appearance.applyFontSize();
		this.appearance.applyContextLineFontSize();
		this.engine.setSettings(this.settings);
	}

	private adjustFontSize(delta: number) {
		const newSize = stepFontSize(this.settings.reader.fontSize, delta);
		if (newSize === this.settings.reader.fontSize) {
			return;
		}

		this.settings = {
			...this.settings,
			reader: { ...this.settings.reader, fontSize: newSize }
		};
		this.appearance.applyFontSize();
		this.appearance.applyContextLineFontSize();
		new Notice(`Font size: ${newSize}px`);
	}

	private renderDesktopChrome(state: ReaderState | null): void {
		if (!this.usesAdaptiveDesktopChrome()) {
			return;
		}

		this.desktopChromeMode = deriveDesktopChromeMode({
			setupRequested: this.setupRequested,
			setupRequired: this.setupRequired,
			isPlaying: Boolean(state?.isPlaying),
			finished: Boolean(state?.finished),
			transitionVisible: this.interSectionOverlay?.isVisible() ?? false
		});

		this.shellEl.removeClass(
			'speed-reader-ai-desktop-setup',
			'speed-reader-ai-desktop-paused',
			'speed-reader-ai-desktop-playing',
			'speed-reader-ai-desktop-transition'
		);
		this.shellEl.addClass(`speed-reader-ai-desktop-${this.desktopChromeMode}`);

		const setupVisible = this.desktopChromeMode === 'setup';
		const pausedVisible =
			this.desktopChromeMode === 'paused' && this.activeTab === 'home';
		const playingVisible = this.desktopChromeMode === 'playing';
		this.desktopReadingSetup?.setVisible(setupVisible);
		this.desktopReadingSetup?.setStatus(this.prepareStatus);
		this.desktopPausedSheet?.setVisible(pausedVisible);
		this.desktopPlayingHud?.setVisible(playingVisible);

		const navigation = this.getDesktopNavigationState();
		this.desktopPausedSheet?.update({
			readerState: state,
			settings: this.settings,
			navigationLabel: navigation.label,
			navigationOptions: navigation.options,
			currentNavigationId: navigation.currentId,
			canStepNavigation: navigation.canStep,
			prepareStatus: this.readerOpen.kind === 'structured' ? this.prepareStatus : 'idle',
			showPrepareStatus: this.readerOpen.kind === 'structured'
		});
		const documentProgress = state ? this.getDocumentProgressPercent(state) : null;
		this.desktopPlayingHud?.update(state, documentProgress);
	}

	private render() {
		const state = this.state;
		if (!state || !this.wordDisplayEl) {
			this.header?.update(state);
			this.renderDesktopChrome(state);
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
		this.renderDesktopChrome(state);
		const showPauseContextInFocus =
			this.focusController.isFocusMode() && !state.isPlaying && !state.finished;
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
		if (
			this.mobileReader &&
			state?.isPlaying &&
			!state.finished &&
			isMobileReadingRoot(this.mobileRoute)
		) {
			this.playingGestureBands?.updateLayout();
		}
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
		this.mobileActionBar?.setTtsEnabled(this.settings.reader.ttsEnabled);
		this.mobileActionBar?.setVisible(!playing && isReadingRoot);
		this.playingGestureBands?.setActive(playing);
	}

	private mountPlayingGestureBandsIfNeeded() {
		if (
			!this.mobileReader ||
			this.playingGestureBands ||
			this.readerOpen.kind === 'preferences'
		) {
			return;
		}
		this.playingGestureBands = mountPlayingGestureBands(
			this.containerEl,
			this.wordDisplayEl,
			() => this.settings.reader.fontSize,
			{
				onTapPlayPause: () => {
					this.toggleReaderPlayPause();
					this.refocusContent();
				},
				onWpmDelta: (delta) => this.adjustWpmFromPlayingBand(delta),
				isBlocked: () => {
					if (this.interSectionOverlay?.isVisible() ?? true) {
						return true;
					}
					if (this.prepareOverlay?.isVisible() ?? true) {
						return true;
					}
					return this.mobileMenuOpen || this.mobileCoachOpen;
				}
			}
		);
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
					this.skipFlash?.flash('left');
					this.handleArrowLeft();
				},
				onDoubleTapRight: () => {
					this.skipFlash?.flash('right');
					this.handleArrowRight();
				},
				onLongPressWord: () => {
					void this.wordLookupHandlers?.lookupCurrentWord();
				},
				onTapContextWord: (word) => {
					void this.wordLookupHandlers?.lookupWord(word);
				},
				onSwipeLeft: () => this.handleSentencePrev(),
				onSwipeRight: () => this.handleSentenceNext(),
				onSwipeChapterLeft: () => this.handleShiftArrowLeft(),
				onSwipeChapterRight: () => this.handleShiftArrowRight(),
				onEdgeHoldStart: (side) => {
					this.edgeScrubSide = side;
					this.edgeScrub.start(side);
				},
				onEdgeHoldEnd: () => {
					const side = this.edgeScrubSide;
					this.edgeScrubSide = null;
					this.handleScrubEnd(side ?? 'left');
				},
				isBlocked: () => {
					if (this.interSectionOverlay?.isVisible() ?? true) {
						return true;
					}
					if (this.prepareOverlay?.isVisible() ?? true) {
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
