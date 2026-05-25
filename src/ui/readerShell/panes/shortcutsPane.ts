export interface ShortcutsPaneHandle {
	destroy(): void;
}

const SHORTCUT_ROWS: [string, string][] = [
	['Space', 'Play / pause'],
	['← / →', 'Rewind / forward (or prev/next line in line modes)'],
	['Shift + ← / →', 'Previous / next section or chapter'],
	['↑ / ↓', 'Increase / decrease WPM'],
	['[ / ]', 'Decrease / increase font size'],
	['L', 'Cycle playback mode (RSVP → Progressive RSVP → Line by line → Line repeat)'],
	['F', 'Toggle focus mode'],
	['B', 'Create bookmark'],
	['Shift + B', 'Open bookmark line picker'],
	['D', 'Look up current word'],
	['Escape', 'Close reader']
];

export function mountShortcutsPane(container: HTMLElement): ShortcutsPaneHandle {
	const pane = container.createDiv({ cls: 'speed-reader-ai-pane speed-reader-ai-pane-shortcuts is-hidden' });
	pane.createEl('h3', { text: 'Keyboard shortcuts' });
	const table = pane.createDiv({ cls: 'speed-reader-ai-shortcuts-table' });
	for (const [key, desc] of SHORTCUT_ROWS) {
		const row = table.createDiv({ cls: 'speed-reader-ai-shortcuts-row' });
		row.createEl('kbd', { text: key });
		row.createSpan({ text: desc });
	}

	return {
		destroy() {
			pane.remove();
		}
	};
}

export function showShortcutsPane(paneEl: HTMLElement, visible: boolean): void {
	paneEl.toggleClass('is-hidden', !visible);
}
