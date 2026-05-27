export interface M4RsvpPanelHandle {
	getRootEl(): HTMLElement;
	getWordContainerEl(): HTMLElement;
	getWordDisplayEl(): HTMLElement;
	getOverlayHostEl(): HTMLElement;
	setGuideLineVisible(visible: boolean): void;
	destroy(): void;
}

export interface M4RsvpPanelOptions {
	showGuideLine: boolean;
}

export function mountM4RsvpPanel(
	container: HTMLElement,
	options: M4RsvpPanelOptions
): M4RsvpPanelHandle {
	const root = container.createDiv({ cls: 'speed-reader-m4-rsvp-panel speed-reader-ai-word-container' });
	const guideCaret = root.createDiv({ cls: 'speed-reader-m4-rsvp-caret' });
	guideCaret.setAttr('aria-hidden', 'true');

	const wordDisplay = root.createDiv({ cls: 'speed-reader-ai-word-display speed-reader-m4-rsvp-word' });
	const guideLine = root.createDiv({ cls: 'speed-reader-m4-rsvp-guide-line' });
	guideLine.toggleClass('is-hidden', !options.showGuideLine);

	const hint = root.createDiv({ cls: 'speed-reader-m4-rsvp-hint' });
	hint.createSpan({ text: 'Tap to play / pause', cls: 'speed-reader-m4-rsvp-hint__label' });

	return {
		getRootEl() {
			return root;
		},
		getWordContainerEl() {
			return root;
		},
		getWordDisplayEl() {
			return wordDisplay;
		},
		getOverlayHostEl() {
			return root;
		},
		setGuideLineVisible(visible: boolean) {
			guideLine.toggleClass('is-hidden', !visible);
		},
		destroy() {
			root.remove();
		}
	};
}
