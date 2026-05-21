export interface EpubParseProgressHandle {
	show(message: string): void;
	hide(): void;
}

const OVERLAY_CLASS = 'speed-reader-ai-epub-parse-overlay';
const SPINNER_CLASS = 'speed-reader-ai-epub-parse-spinner';
const MESSAGE_CLASS = 'speed-reader-ai-epub-parse-message';

/** Full-screen overlay while EPUB is parsed or chapter names are fetched via LLM. */
export function createEpubParseProgressOverlay(): EpubParseProgressHandle {
	let overlayEl: HTMLElement | null = null;
	let messageEl: HTMLElement | null = null;

	return {
		show(message: string) {
			if (!overlayEl) {
				overlayEl = document.body.createDiv({ cls: OVERLAY_CLASS });
				overlayEl.createDiv({ cls: SPINNER_CLASS });
				messageEl = overlayEl.createDiv({ cls: MESSAGE_CLASS });
			}
			messageEl?.setText(message);
		},
		hide() {
			overlayEl?.remove();
			overlayEl = null;
			messageEl = null;
		}
	};
}
