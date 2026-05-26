import { MOBILE_ROUTE_LABELS } from '../mobileNavigation';
import { mountMobileStackChrome, type MobileStackChromeHandle } from '../mobileStackChrome';

export interface ShortcutsPaneOptions {
	isMobile?: boolean;
}

export interface ShortcutsPaneHandle {
	destroy(): void;
	onSwipeBack(cb: () => void): void;
}

const SHORTCUT_ROWS: [string, string][] = [
	['Space', 'Play / pause'],
	['← / →', 'Rewind / forward (or prev/next line in line modes)'],
	['Shift + ← / →', 'Previous / next section or chapter'],
	['↑ / ↓', 'Increase / decrease WPM'],
	['[ / ]', 'Decrease / increase font size'],
	['L', 'Cycle playback mode (RSVP → Progressive RSVP → Line by line → Line repeat)'],
	['F', 'Toggle immersive focus (fullscreen)'],
	['B', 'Create bookmark'],
	['Shift + B', 'Open bookmark line picker'],
	['D', 'Look up current word'],
	['Escape', 'Close reader']
];

export function mountShortcutsPane(
	container: HTMLElement,
	options: ShortcutsPaneOptions = {}
): ShortcutsPaneHandle {
	const isMobile = options.isMobile ?? false;
	const pane = container.createDiv({
		cls: 'speed-reader-ai-pane speed-reader-ai-pane-shortcuts is-hidden'
	});

	let stackChrome: MobileStackChromeHandle | null = null;
	let bodyHost: HTMLElement = pane;
	if (isMobile) {
		stackChrome = mountMobileStackChrome(pane, {
			title: MOBILE_ROUTE_LABELS.shortcuts,
			scrollEl: pane
		});
		bodyHost = pane.createDiv({ cls: 'speed-reader-ai-mobile-stack-body' });
	}

	if (!isMobile) {
		bodyHost.createEl('h3', { text: 'Keyboard shortcuts' });
	}
	const table = bodyHost.createDiv({ cls: 'speed-reader-ai-shortcuts-table' });
	for (const [key, desc] of SHORTCUT_ROWS) {
		const row = table.createDiv({ cls: 'speed-reader-ai-shortcuts-row' });
		row.createEl('kbd', { text: key });
		row.createSpan({ text: desc });
	}

	return {
		destroy() {
			stackChrome?.destroy();
			pane.remove();
		},
		onSwipeBack(cb) {
			stackChrome?.onBack(cb);
		}
	};
}

export function showShortcutsPane(paneEl: HTMLElement, visible: boolean): void {
	paneEl.toggleClass('is-hidden', !visible);
}
