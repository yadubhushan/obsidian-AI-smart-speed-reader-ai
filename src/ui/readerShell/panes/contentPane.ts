export interface ContentPaneHandle {
	destroy(): void;
	setText(text: string, title?: string): void;
}

export function mountContentPane(container: HTMLElement): ContentPaneHandle {
	const pane = container.createDiv({ cls: 'speed-reader-ai-pane speed-reader-ai-pane-content is-hidden' });
	const titleEl = pane.createDiv({ cls: 'speed-reader-ai-content-title', text: 'Selected text (Complete content)' });
	const panel = pane.createDiv({ cls: 'speed-reader-ai-content-panel' });
	const body = panel.createDiv({ cls: 'speed-reader-ai-content-body' });

	return {
		destroy() {
			pane.remove();
		},
		setText(text, title) {
			if (title) {
				titleEl.setText(title);
			}
			body.setText(text);
		}
	};
}

export function showContentPane(paneEl: HTMLElement, visible: boolean): void {
	paneEl.toggleClass('is-hidden', !visible);
}
