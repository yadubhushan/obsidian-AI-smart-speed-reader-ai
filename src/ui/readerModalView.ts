import { App, Modal, Notice } from 'obsidian';
import { RSVPEngine } from '../engine/rsvpEngine';
import { tokenDisplayLabel } from '../engine/manifestPlayback';
import { SettingsBackedLlmClient, describeActiveLlmBackend } from '../llm/createLlmClient';
import { getAiProvidersApi } from '../llm/aiProvidersBridge';
import type { LlmModelCatalog } from '../llm/llmModelCatalog';
import { createDefaultLlmModelCatalog } from '../llm/llmModelCatalog';
import type { ManifestStore } from '../store/ManifestStore';
import { DEFAULT_SETTINGS, HeadingInfo, ReaderState, SpeedReaderAiSettings, WordData } from '../types';
import type { PreparePromptSet } from '../llm/promptCatalog';
import type { ProcessingModeId } from '../types/processedDocument';
import { mountModePicker, type ModePickerHandle } from './modePicker';
import { mountPrepareControls, type PrepareControlsHandle } from './prepareControls';
import { mountChapterNavControls, type ChapterNavControlsHandle } from './chapterNavControls';
import { mountSectionNavControls, type SectionNavControlsHandle } from './sectionNavControls';
import { applyNoteResumePosition } from '../reader/readingProgress';
import type { SpeedReaderOpen } from './speedReaderOpen';
import { StructuredReaderSession } from './structuredReaderSession';
import { bookIndexToProcessedDocument } from '../formats/bookIndexToProcessedDocument';
import { bookCacheBasePath, bookCacheCoverPath } from '../store/bookCachePaths';
import type { ReaderSessionHooks } from '../reader/readingProgressTracker';
import type { ReaderBookmarkHandles } from '../features/feature4/attachReaderBookmarks';
import type { ReaderWordLookupHandles } from '../features/word-lookup/attachReaderWordLookup';
import type { DictionaryLookupOutcome } from '../dictionary/dictionaryTypes';
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
import { mountMobilePeekSheet, type MobilePeekSheetHandle } from './readerShell/mobilePeekSheet';
import {
	resolveReaderBackAction,
	type ReaderBackAction
} from './readerShell/readerBackNavigation';

const INTER_SECTION_MS = 2000;
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
	private mobilePeekSheet: MobilePeekSheetHandle | null = null;
	private previousIsPlaying: boolean | null = null;

	private session: StructuredReaderSession | null = null;
	private engine: RSVPEngine;
	private focusMode = false;
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
	private mobilePeekOpen = false;
	private mobileDictionaryOpen = false;
	private wasPlayingBeforeDictionary = false;
	private mobileCoachOpen = false;
	private edgeHoldSide: EdgeSide | null = null;
	private edgeScrubTimer: number | null = null;
	private edgeScrubTickCount = 0;
	private skipFlashEl: HTMLElement | null = null;
	private skipFlashTimer: number | null = null;
	private readonly mobileReader = isMobileReader();
	private contentPane!: ContentPaneHandle;
	private settingsPane!: SettingsPaneHandle;
	private shortcutsPane!: ShortcutsPaneHandle;
	private advancedPane!: AdvancedPaneHandle;
	private modePickerHost!: HTMLElement;
	private structuredBarEl!: HTMLElement;
	private headingSelectWrapper!: HTMLElement;
	private sectionSelect!: HTMLSelectElement;
	private interSectionOverlayEl: HTMLElement | null = null;
	private prepareOverlayEl: HTMLElement | null = null;
	private prepareOverlaySublineEl: HTMLElement | null = null;
	private interSectionTimer: number | null = null;

	private modePicker: ModePickerHandle | null = null;
	private prepareControls: PrepareControlsHandle | null = null;
	private sectionNav: SectionNavControlsHandle | null = null;
	private chapterNav: ChapterNavControlsHandle | null = null;
	private coverObjectUrl: string | null = null;
	constructor(
		app: App,
		readerOpen: SpeedReaderOpen,
		settings: SpeedReaderAiSettings,
		onSettingsChange: (settings: SpeedReaderAiSettings) => void,
		manifestStore?: ManifestStore,
		preparePrompts?: PreparePromptSet,
		onCacheCleared?: () => void | Promise<void>,
		onReaderClose?: () => void,
		llmModelCatalog: LlmModelCatalog = createDefaultLlmModelCatalog()
	) {
		super(app);
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
			chunkSize: this.settings.reader.chunkSize,
			rtl: this.settings.reader.textOrientation.rtl,
			showRemainingTime: this.settings.reader.display.showRemainingTime,
			showProgress: this.settings.reader.display.showProgress
		});
		this.header.onPlayPause(() => {
			this.engine.togglePlayPause();
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
					this.engine.togglePlayPause();
					this.refocusContent();
				},
				onWpmDelta: (delta) => this.adjustWpm(delta),
				onFontDelta: (delta) => this.adjustFontSize(delta),
				onToggleMode: () => {
					this.engine.togglePlaybackMode();
					this.render();
				}
			});
			this.mobileCompactBar.onClose(() => this.forceClose());
			this.mobileCompactBar.onChapterPillTap(() => {
				if (this.state?.isPlaying) {
					return;
				}
				this.openMobileMenu('chapters');
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
		this.headingSelectWrapper = this.structuredBarEl.createDiv({
			cls: 'speed-reader-ai-section-select-wrapper is-hidden'
		});
		this.sectionSelect = this.headingSelectWrapper.createEl('select', {
			cls: 'speed-reader-ai-section-select'
		});
		this.sectionSelect.addEventListener('change', () => this.onHeadingSelectChange());

		this.contentPane = mountContentPane(this.paneStackEl);
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
			showMobileGesturesGuide: this.mobileReader
		});
		this.shortcutsPane = mountShortcutsPane(this.paneStackEl);
		this.advancedPane = mountAdvancedPane(this.paneStackEl, this.settings, {
			onSave: (next) => {
				this.persistSettings(next);
				this.returnToReadingAfterPaneAction();
			}
		});

		this.controlBar = mountReaderControlBar(
			this.shellEl,
			this.settings,
			{
				onWpmDelta: (delta) => this.adjustWpm(delta),
				onFontDelta: (delta) => this.adjustFontSize(delta),
				onToggleMode: () => {
					this.engine.togglePlaybackMode();
					this.render();
				},
				onReadWithoutAi: () => this.onReadWithoutAi(),
				onPrepare: () => this.onPrepareWithAi(),
				onClearCache: () => this.onClearDocumentCache(),
				onPrevSection: () => {
					if (!this.canNavigateSections()) return;
					this.engine.prevSection();
					this.notifySectionChange();
					this.refocusContent();
				},
				onNextSection: () => {
					if (!this.canNavigateSections()) return;
					this.engine.nextSection();
					this.notifySectionChange();
					this.refocusContent();
				}
			},
			{
				showSectionNav: false,
				sectionNavLabel: this.readerOpen.kind === 'book' ? 'Chapter' : 'Section'
			}
		);

		if (this.mobileReader && this.readerOpen.kind !== 'preferences') {
			this.mobileActionBar = mountMobileActionBar(this.mobilePausedStackEl!);
			this.mobileActionBar.onBookmark(() => {
				void this.createMobileBookmark();
			});
			this.mobileActionBar.onDefine(() => {
				void this.wordLookupHandlers?.lookupCurrentWord();
			});
			this.mobileActionBar.onMenu(() => {
				this.openMobileMenu();
			});

			this.mobilePeekSheet = mountMobilePeekSheet(this.shellEl, {
				getSettings: () => this.settings,
				getState: () => this.state,
				onWpmChange: (wpm) => this.setReaderWpm(wpm),
				onFontChange: (fontSize) => this.setReaderFontSize(fontSize),
				onToggleMode: () => {
					this.engine.togglePlaybackMode();
					this.render();
				}
			});
			this.mobilePeekSheet.onOpenChange((open) => {
				this.mobilePeekOpen = open;
				if (open) {
					this.mobileBottomSheet?.close();
					this.dismissDictionaryUi(false);
				}
				this.render();
			});
		}

		if (this.mobileReader) {
			this.mobileBottomSheet = mountMobileBottomSheet(
				this.shellEl,
				this.engine,
				{
					preferencesOnly: this.readerOpen.kind === 'preferences',
					onSelectTab: (tab) => this.setActiveTab(tab),
					onChapterSelect: (sectionId) => this.onMobileChapterSelect(sectionId),
					canNavigateSections: () => this.canNavigateSections(),
					getSettings: () => this.settings,
					getState: () => this.state,
					onWpmChange: (wpm) => this.setReaderWpm(wpm),
					onFontChange: (fontSize) => this.setReaderFontSize(fontSize),
					onToggleMode: () => {
						this.engine.togglePlaybackMode();
						this.render();
					}
				}
			);
			this.mobileBottomSheet.onOpenChange((open) => {
				this.mobileMenuOpen = open;
				if (open) {
					this.mobilePeekSheet?.close();
					this.dismissDictionaryUi(false);
				}
				this.render();
			});
		} else {
			this.tabDock = mountReaderTabDock(
				this.shellEl,
				this.activeTab,
				(tab) => this.setActiveTab(tab),
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
			await this.session.initialize(this.readerOpen.preferredProcessingMode);
			this.mountStructuredControls();
			const kind = await this.session.loadPlayback(this.engine, this.session.activeModeId);
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
		this.clearAutoStartTimer();
		this.revokeCoverObjectUrl();
		this.bookmarkHandlers = null;
		this.wordLookupHandlers = null;
		this.dictionaryOverlay?.dismiss();
		this.dictionaryOverlay = null;
		this.mobileDictionarySheet?.destroy();
		this.mobileDictionarySheet = null;
		this.mobilePeekSheet?.destroy();
		this.mobilePeekSheet = null;
		this.clearInterSectionTimer();
		this.hidePrepareOverlay();
		this.modePicker?.destroy();
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
		removeMobileShellClass(this.shellEl);
		this.contentPane?.destroy();
		this.settingsPane?.destroy();
		this.shortcutsPane?.destroy();
		this.advancedPane?.destroy();
		this.ownerDoc.removeEventListener('visibilitychange', this.boundVisibilityHandler);
		this.ownerDoc.defaultView?.removeEventListener('blur', this.boundBlurHandler);
		this.engine.pause();
		this.onSettingsChange(this.settings);
		this.contentEl.empty();
		this.onReaderClose?.();
	}

	setInitialTab(tab: ReaderTabId): void {
		this.activeTab = tab;
		this.tabDock?.setActiveTab(tab);
		this.setActiveTab(tab);
	}

	private setActiveTab(tab: ReaderTabId) {
		this.activeTab = tab;
		this.tabDock?.setActiveTab(tab);
		this.mobileBottomSheet?.setActiveTab(tab);
		if (this.mobileReader && tab !== 'home') {
			this.mobileBottomSheet?.close();
		}
		const isHome = tab === 'home';
		this.homePaneEl?.toggleClass('is-hidden', !isHome);
		this.paneStackEl
			?.querySelector('.speed-reader-ai-pane-content')
			?.toggleClass('is-hidden', tab !== 'content');
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
		this.controlBar?.setVisible(
			isHome && !this.mobileReader && this.readerOpen.kind !== 'preferences'
		);
		this.shellEl?.toggleClass('is-preferences-only', this.readerOpen.kind === 'preferences');

		if (tab === 'settings') {
			this.settingsPane?.refresh(this.settings);
		}
		if (tab === 'advanced') {
			this.advancedPane?.refresh(this.settings);
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
			this.engine.play();
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
			this.mobilePeekSheet?.close();
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

	private openMobileMenu(initialTab: 'chapters' | 'reading' = 'chapters'): void {
		this.mobilePeekSheet?.close();
		this.dismissDictionaryUi(false);
		this.mobileBottomSheet?.open({ initialMenuTab: initialTab });
	}

	private openMobilePeek(): void {
		if (this.state?.isPlaying) {
			return;
		}
		this.mobileBottomSheet?.close();
		this.dismissDictionaryUi(false);
		this.mobilePeekSheet?.open();
	}

	private closeMobileOverlays(): void {
		this.mobilePeekSheet?.close();
		this.mobileBottomSheet?.close();
		this.dismissDictionaryUi(false);
	}

	private isMobileOverlayOpen(): boolean {
		return this.mobileMenuOpen || this.mobilePeekOpen || this.mobileDictionaryOpen;
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

	private mountStructuredControls() {
		if (!this.session) return;

		this.modePicker = mountModePicker(
			this.modePickerHost,
			this.session.activeModeId,
			(modeId) => this.onModeChange(modeId)
		);

		const sectionHost = this.structuredBarEl.createDiv({ cls: 'speed-reader-ai-section-nav-host' });
		this.sectionNav = mountSectionNavControls(sectionHost, this.engine, () => this.refocusContent());
		if (!this.mobileReader) {
			this.structuredBarEl.removeClass('is-hidden');
		}
	}

	private mountBookControls() {
		const sectionHost = this.structuredBarEl.createDiv({ cls: 'speed-reader-ai-section-nav-host' });
		this.chapterNav = mountChapterNavControls(sectionHost, this.engine, () => this.refocusContent());
	}

	private async onModeChange(modeId: ProcessingModeId) {
		if (!this.session) return;
		await this.session.setActiveMode(modeId);
		this.modePicker?.setValue(modeId);
		const kind = await this.session.loadPlayback(this.engine, modeId);
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
			this.prepareControls?.setStatus('prepared');
			this.rebuildHeadingSelector();
			this.sectionNav?.refresh();
			this.updateModeSpecificUi();
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
		const profile = this.engine.getReaderUxProfile();
		const state = this.state;
		if (!profile?.interSectionPause || state?.isDeterministic) {
			this.engine.nextSection();
			this.notifySectionChange();
			return;
		}

		const sections = this.engine.getSectionList();
		const nextIndex = (state?.currentSectionIndex ?? 0) + 1;
		if (nextIndex >= sections.length) {
			return;
		}

		const nextTitle = sections[nextIndex]?.title ?? 'Next section';
		this.engine.pause();
		this.showInterSectionOverlay(nextTitle, () => {
			this.engine.nextSection();
			this.notifySectionChange();
			this.engine.play();
		});
	}

	private showInterSectionOverlay(title: string, onContinue: () => void) {
		if (!this.interSectionOverlayEl) return;
		this.clearInterSectionTimer();
		this.interSectionOverlayEl.empty();
		this.interSectionOverlayEl.removeClass('is-hidden');
		this.interSectionOverlayEl.createSpan({
			cls: 'speed-reader-ai-inter-section-label',
			text: 'Next section'
		});
		this.interSectionOverlayEl.createSpan({
			cls: 'speed-reader-ai-inter-section-title',
			text: title
		});
		const skip = this.interSectionOverlayEl.createEl('button', {
			cls: 'speed-reader-ai-btn speed-reader-ai-btn-secondary',
			text: 'Continue'
		});
		skip.addEventListener('click', () => this.dismissInterSectionOverlay(onContinue), { once: true });

		this.interSectionTimer = window.setTimeout(() => {
			this.dismissInterSectionOverlay(onContinue);
		}, INTER_SECTION_MS);
	}

	private dismissInterSectionOverlay(onContinue: () => void) {
		this.clearInterSectionTimer();
		this.interSectionOverlayEl?.addClass('is-hidden');
		onContinue();
	}

	private clearInterSectionTimer() {
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
		if (this.mobilePeekOpen) {
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
			preferencesOnly: this.readerOpen.kind === 'preferences',
			dictionaryVisible: this.isDictionaryOverlayVisible(),
			coachMarksOpen: this.mobileCoachOpen,
			peekSheetOpen: this.mobilePeekOpen,
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
			case 'close-peek-sheet':
				this.mobilePeekSheet?.close();
				break;
			case 'close-bottom-sheet':
				this.mobileBottomSheet?.close();
				break;
			case 'go-home':
				this.setActiveTab('home');
				this.refocusContent();
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
			this.engine.togglePlayPause();
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
			void this.bookmarkHandlers?.openBookmarkTarget();
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
				this.engine.togglePlayPause();
			}
		});
	}

	private handleArrowLeft() {
		if (this.state?.playbackMode === 'lineRepeat') {
			this.engine.prevLine();
		} else {
			this.engine.rewindSmart();
		}
		this.refocusContent();
	}

	private handleArrowRight() {
		if (this.state?.playbackMode === 'lineRepeat') {
			this.engine.nextLine();
		} else {
			this.engine.fastForwardSmart();
		}
		this.refocusContent();
	}

	private handleShiftArrowLeft() {
		if (!this.canNavigateSections()) {
			return;
		}
		this.engine.prevSection();
		this.notifySectionChange();
		this.refocusContent();
	}

	private handleShiftArrowRight() {
		if (!this.canNavigateSections()) {
			return;
		}
		this.engine.nextSection();
		this.notifySectionChange();
		this.refocusContent();
	}

	private canNavigateSections(): boolean {
		const profile = this.engine.getReaderUxProfile();
		return (
			(this.readerOpen.kind === 'structured' || this.readerOpen.kind === 'book') &&
			(profile?.sectionNav ?? false) &&
			this.engine.getSectionList().length > 0
		);
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
			this.engine.goToSection(value);
			this.notifySectionChange();
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
		this.mobilePeekSheet?.refresh();
		this.mobileBottomSheet?.refreshReadingControls();
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
		this.mobilePeekSheet?.refresh();
		this.mobileBottomSheet?.refreshReadingControls();
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

		this.renderWord(state);
		this.header?.update(state);
		this.controlBar?.update(state);
		const showPauseContextInFocus =
			this.focusMode && !state.isPlaying && !state.finished;
		const showContext =
			this.settings.reader.display.showContext || showPauseContextInFocus;
		this.contextLine?.setVisible(this.activeTab === 'home' && showContext);
		this.contextLine?.render(state, this.engine, showContext);
		this.renderSectionVisibility();
		this.sectionNav?.updateFromState(state);
		this.chapterNav?.updateFromState(state);
		this.syncMobileChrome(state);
	}

	private syncMobileChrome(state: ReaderState | null) {
		if (!this.mobileReader) {
			return;
		}
		const isHome = this.activeTab === 'home';
		const playing = Boolean(state?.isPlaying && !state.finished && isHome);
		if (playing) {
			this.closeMobileOverlays();
		}
		syncMobilePlayingState(this.shellEl, playing, this.isMobileOverlayOpen());
		syncMobilePausedState(this.shellEl, !playing && isHome);
		syncMobileProgressStrip(
			this.mobileProgressStripEl,
			isHome ? state : null,
			this.settings.reader.display.showProgress
		);
		if (this.mobileCompactBar && state) {
			this.mobileCompactBar.update(state, this.settings);
			this.mobileCompactBar.setChapterNavVisible(this.canNavigateSections());
			this.mobileCompactBar.setVisible(!playing && isHome);
		}
		this.mobileActionBar?.setVisible(!playing && isHome);
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
					this.engine.togglePlayPause();
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
						this.mobilePeekOpen ||
						this.mobileCoachOpen ||
						this.isDictionaryOverlayVisible()
					);
				},
				isHomeActive: () => this.activeTab === 'home',
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
			this.engine.goToSection(sectionId);
			this.notifySectionChange();
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
			bookCacheBasePath(),
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
			this.renderWordUnit(wordWrapper, word, state, seekIndices[i] ?? state.currentIndex + i);
		}
	}

	private renderWordUnit(
		parent: HTMLElement,
		word: WordData,
		state: ReaderState,
		seekIndex: number
	) {
		const unit = parent.createSpan({ cls: 'speed-reader-ai-word-unit' });
		if (
			state.playbackMode === 'lineRepeat' &&
			state.lineStartSeekIndex !== undefined &&
			seekIndex === state.lineStartSeekIndex
		) {
			unit.addClass('is-line-start');
		}
		if (
			state.playbackMode === 'lineRepeat' &&
			state.lineEndSeekIndex !== undefined &&
			seekIndex === state.lineEndSeekIndex
		) {
			unit.addClass('is-line-end');
		}
		const before = word.word.slice(0, word.orpIndex);
		const orp = word.word.charAt(word.orpIndex);
		const after = word.word.slice(word.orpIndex + 1);

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
