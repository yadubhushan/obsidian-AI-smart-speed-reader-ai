import type { SpeedReaderAiSettings } from '../../../types';
import type { ContextLineHandle } from '../contextLine';
import { mountM4BottomControls, type M4BottomControlsHandle } from './m4BottomControls';
import { mountM4ChapterModal, type M4ChapterModalHandle, type M4ChapterModalItem } from './m4ChapterModal';
import { mountM4ContextVisualizer, type M4ContextVisualizerHandle } from './m4ContextVisualizer';
import { mountM4ReaderModeBar, type M4ReaderModeBarHandle } from './m4ReaderModeBar';
import { mountM4RsvpPanel, type M4RsvpPanelHandle } from './m4RsvpPanel';
import { mountM4TopBar, type M4TopBarHandle } from './m4TopBar';

export interface M4ReaderViewHandle {
	getRsvpPanel(): M4RsvpPanelHandle;
	getContextLine(): ContextLineHandle;
	getWordContainerEl(): HTMLElement;
	getWordDisplayEl(): HTMLElement;
	setChapterProgress(progress: string, chapterLabel: string): void;
	setChapterItems(items: M4ChapterModalItem[]): void;
	openChapterModal(): void;
	closeChapterModal(): boolean;
	updateControls(settings: SpeedReaderAiSettings): void;
	setGuideLineVisible(visible: boolean): void;
	setChromeVisible(visible: boolean): void;
	destroy(): void;
}

export interface M4ReaderViewOptions {
	settings: SpeedReaderAiSettings;
	isMobile: boolean;
	onTapPlayPause: () => void;
	onWpmDelta: (delta: number) => void;
	onFontDelta: (delta: number) => void;
	onChunkSizeChange: (size: 1 | 2 | 3) => void;
	onGuideLineToggle: (enabled: boolean) => void;
	onBookmarkOnce: () => void;
	onBookmarkExplorer: () => void;
	onOpenSettings: () => void;
	onClose: () => void;
	onOverflow: () => void;
	onChapterSelect: (id: string) => void;
	onChapterPillTap: () => void;
	onWordSeek: (word: string) => void;
	onWordLookup: (word: string) => void;
	structuredBarHost?: HTMLElement;
}

export function mountM4ReaderView(
	container: HTMLElement,
	options: M4ReaderViewOptions
): M4ReaderViewHandle {
	const root = container.createDiv({ cls: 'speed-reader-m4-reader-view' });

	const topBar = mountM4TopBar(root, {
		onChapterPillTap: options.onChapterPillTap,
		onClose: options.onClose,
		onOverflow: options.onOverflow
	});

	const modeBar = mountM4ReaderModeBar(root, {
		chunkSize: options.settings.reader.chunkSize,
		showGuideLine: options.settings.reader.display.showGuideLine,
		onChunkSizeChange: options.onChunkSizeChange,
		onGuideLineToggle: options.onGuideLineToggle
	});

	if (options.structuredBarHost) {
		options.structuredBarHost.addClass('speed-reader-m4-structured-bar');
		options.structuredBarHost.addClass('speed-reader-m4-chrome');
		root.appendChild(options.structuredBarHost);
	}

	const rsvpPanel = mountM4RsvpPanel(root, {
		showGuideLine: options.settings.reader.display.showGuideLine
	});

	const gestureHint = root.createDiv({ cls: 'speed-reader-m4-gesture-hint speed-reader-m4-chrome' });
	gestureHint.createSpan({
		text: 'TAP TO PLAY / PAUSE',
		cls: 'speed-reader-m4-gesture-hint__title'
	});
	gestureHint.createEl('p', {
		text: 'Swipe ← → to jump · Swipe ↑ ↓ for speed',
		cls: 'speed-reader-m4-gesture-hint__desc'
	});

	const contextViz = mountM4ContextVisualizer(root, {
		onWordSeek: options.onWordSeek,
		onWordLookup: options.onWordLookup,
		enableDesktopDoubleTapLookup: !options.isMobile
	});

	const bottomControls = mountM4BottomControls(root, {
		wpm: options.settings.reader.wpm,
		fontSize: options.settings.reader.fontSize,
		onWpmDelta: options.onWpmDelta,
		onFontDelta: options.onFontDelta,
		onBookmarkOnce: options.onBookmarkOnce,
		onBookmarkExplorer: options.onBookmarkExplorer,
		onOpenSettings: options.onOpenSettings
	});

	const chapterModal = mountM4ChapterModal(root, {
		onSelect: options.onChapterSelect
	});

	return {
		getRsvpPanel() {
			return rsvpPanel;
		},
		getContextLine() {
			return contextViz.getContextLineHandle();
		},
		getWordContainerEl() {
			return rsvpPanel.getWordContainerEl();
		},
		getWordDisplayEl() {
			return rsvpPanel.getWordDisplayEl();
		},
		setChapterProgress(progress: string, chapterLabel: string) {
			topBar.setProgressLabel(progress);
			topBar.setChapterLabel(chapterLabel);
		},
		setChapterItems(items: M4ChapterModalItem[]) {
			chapterModal.setItems(items);
		},
		openChapterModal() {
			chapterModal.open();
		},
		closeChapterModal() {
			if (!chapterModal.isOpen()) {
				return false;
			}
			chapterModal.close();
			return true;
		},
		updateControls(settings: SpeedReaderAiSettings) {
			bottomControls.updateWpm(settings.reader.wpm);
			bottomControls.updateFontSize(settings.reader.fontSize);
			modeBar.setChunkSize(settings.reader.chunkSize);
			modeBar.setGuideLineEnabled(settings.reader.display.showGuideLine);
			rsvpPanel.setGuideLineVisible(settings.reader.display.showGuideLine);
		},
		setGuideLineVisible(visible: boolean) {
			rsvpPanel.setGuideLineVisible(visible);
			modeBar.setGuideLineEnabled(visible);
		},
		setChromeVisible(visible: boolean) {
			root.toggleClass('speed-reader-m4-chrome-hidden', !visible);
			root.toggleClass('speed-reader-m4-immersive', !visible);
		},
		destroy() {
			bottomControls.destroy();
			contextViz.destroy();
			rsvpPanel.destroy();
			modeBar.destroy();
			topBar.destroy();
			chapterModal.destroy();
			root.remove();
		}
	};
}
