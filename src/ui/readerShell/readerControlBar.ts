import type { PlaybackMode, ReaderState, SpeedReaderAiSettings } from '../../types';
import { mountPrepareControls, type PrepareControlsHandle } from '../prepareControls';
import { mountPlaybackModeSelect, type PlaybackModeSelectHandle } from './playbackModePicker';

export interface ReaderControlBarHandle {
	destroy(): void;
	update(state: ReaderState | null, documentProgressPercent?: number | null): void;
	setVisible(visible: boolean): void;
	setPrepareVisible(visible: boolean): void;
	getPrepareControls(): PrepareControlsHandle | null;
}

export interface ReaderControlBarHandlers {
	onWpmDelta: (delta: number) => void;
	onFontDelta: (delta: number) => void;
	onPlaybackModeChange: (mode: PlaybackMode) => void;
	onCopyContext: () => void | Promise<void>;
	onReadWithoutAi: () => void;
	onPrepare: () => void | Promise<void>;
	onClearCache: () => void | Promise<void>;
	onPrevSection?: () => void;
	onNextSection?: () => void;
}

export function mountReaderControlBar(
	container: HTMLElement,
	settings: SpeedReaderAiSettings,
	handlers: ReaderControlBarHandlers,
	options: {
		showSectionNav: boolean;
		sectionNavLabel: string;
		/** When true, show total note/book read % beside Mode (desktop). */
		showDocumentProgress?: boolean;
	}
): ReaderControlBarHandle {
	const showDocumentProgress = options.showDocumentProgress ?? false;
	const bar = container.createDiv({ cls: 'speed-reader-ai-control-bar' });
	const row = bar.createDiv({ cls: 'speed-reader-ai-control-row' });

	const fontGroup = row.createDiv({ cls: 'speed-reader-ai-control-group' });
	fontGroup.createSpan({ cls: 'speed-reader-ai-control-label', text: 'Font' });
	const fontDec = fontGroup.createEl('button', { cls: 'speed-reader-ai-control-btn', text: '−' });
	const fontVal = fontGroup.createSpan({ cls: 'speed-reader-ai-control-value' });
	const fontInc = fontGroup.createEl('button', { cls: 'speed-reader-ai-control-btn', text: '+' });

	const wpmGroup = row.createDiv({ cls: 'speed-reader-ai-control-group' });
	wpmGroup.createSpan({ cls: 'speed-reader-ai-control-label', text: 'WPM' });
	const wpmDec = wpmGroup.createEl('button', { cls: 'speed-reader-ai-control-btn', text: '−' });
	const wpmVal = wpmGroup.createSpan({ cls: 'speed-reader-ai-control-value' });
	const wpmInc = wpmGroup.createEl('button', { cls: 'speed-reader-ai-control-btn', text: '+' });

	const modeGroup = row.createDiv({ cls: 'speed-reader-ai-control-group' });
	modeGroup.createSpan({ cls: 'speed-reader-ai-control-label', text: 'Mode' });
	const modePicker = mountPlaybackModeSelect(modeGroup, {
		className: 'speed-reader-ai-control-mode-select',
		ariaLabel: 'Playback mode',
		onChange: handlers.onPlaybackModeChange
	});
	const docPctVal = showDocumentProgress
		? modeGroup.createSpan({
				cls: 'speed-reader-ai-control-value speed-reader-ai-control-doc-pct',
				attr: {
					'aria-live': 'polite',
					title: 'Total read progress through this note or book'
				}
			})
		: null;
	const copyContextBtn = row.createEl('button', {
		cls: 'speed-reader-ai-control-btn',
		text: 'Copy context',
		attr: {
			type: 'button',
			'aria-label': 'Copy paragraph context prompt'
		}
	});

	const navGroup = row.createDiv({ cls: 'speed-reader-ai-control-nav-group' });
	const prevBtn = navGroup.createEl('button', {
		cls: 'speed-reader-ai-control-btn',
		text: `← ${options.sectionNavLabel}`,
		attr: { type: 'button' }
	});
	const nextBtn = navGroup.createEl('button', {
		cls: 'speed-reader-ai-control-btn',
		text: `${options.sectionNavLabel} →`,
		attr: { type: 'button' }
	});
	navGroup.toggleClass('is-hidden', !options.showSectionNav);

	const prepareHost = bar.createDiv({ cls: 'speed-reader-ai-control-prepare-host' });
	let prepareControls: PrepareControlsHandle | null = null;

	fontDec.addEventListener('click', () => handlers.onFontDelta(-3));
	fontInc.addEventListener('click', () => handlers.onFontDelta(3));
	wpmDec.addEventListener('click', () => handlers.onWpmDelta(-25));
	wpmInc.addEventListener('click', () => handlers.onWpmDelta(25));
	copyContextBtn.addEventListener('click', () => {
		void handlers.onCopyContext();
	});
	prevBtn.addEventListener('click', () => handlers.onPrevSection?.());
	nextBtn.addEventListener('click', () => handlers.onNextSection?.());

	return {
		destroy() {
			modePicker.destroy();
			prepareControls?.destroy();
			bar.remove();
		},
		update(state, documentProgressPercent) {
			fontVal.setText(String(settings.reader.fontSize));
			wpmVal.setText(String(state ? Math.round(state.currentWpm) : settings.reader.wpm));
			modePicker.setMode(state?.playbackMode ?? settings.reader.defaultPlaybackMode);
			if (docPctVal) {
				if (documentProgressPercent == null || !state) {
					docPctVal.setText('');
					docPctVal.addClass('is-hidden');
				} else {
					const pct = Math.min(Math.round(documentProgressPercent), 100);
					docPctVal.setText(`${pct}%`);
					docPctVal.removeClass('is-hidden');
				}
			}
		},
		setVisible(visible) {
			bar.toggleClass('is-hidden', !visible);
		},
		setPrepareVisible(visible) {
			prepareHost.empty();
			prepareControls?.destroy();
			prepareControls = null;
			if (!visible) {
				prepareHost.addClass('is-hidden');
				return;
			}
			prepareHost.removeClass('is-hidden');
			prepareControls = mountPrepareControls(prepareHost, {
				onReadWithoutAi: handlers.onReadWithoutAi,
				onPrepare: handlers.onPrepare,
				onClearCache: handlers.onClearCache
			});
		},
		getPrepareControls: () => prepareControls
	};
}
