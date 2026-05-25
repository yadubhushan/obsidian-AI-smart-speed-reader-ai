import { MOBILE_ROUTE_LABELS } from '../mobileNavigation';
import { mountMobileStackChrome, type MobileStackChromeHandle } from '../mobileStackChrome';

export interface ContentPaneOptions {
	isMobile?: boolean;
}

export interface ContentPaneHandle {
	destroy(): void;
	setText(text: string, title?: string): void;
	onSwipeBack(cb: () => void): void;
}

export function mountContentPane(
	container: HTMLElement,
	options: ContentPaneOptions = {}
): ContentPaneHandle {
	const isMobile = options.isMobile ?? false;
	const pane = container.createDiv({
		cls: 'speed-reader-ai-pane speed-reader-ai-pane-content is-hidden'
	});

	let stackChrome: MobileStackChromeHandle | null = null;
	if (isMobile) {
		stackChrome = mountMobileStackChrome(pane, {
			title: MOBILE_ROUTE_LABELS.content,
			scrollEl: pane
		});
	}

	const titleEl = pane.createDiv({
		cls: `speed-reader-ai-content-title${isMobile ? ' is-hidden' : ''}`,
		text: 'Selected text (Complete content)'
	});
	const panel = pane.createDiv({ cls: 'speed-reader-ai-content-panel' });
	const body = panel.createDiv({ cls: 'speed-reader-ai-content-body' });

	return {
		destroy() {
			stackChrome?.destroy();
			pane.remove();
		},
		setText(text, title) {
			if (title) {
				titleEl.setText(title);
				stackChrome?.setTitle(title);
			}
			body.setText(text);
		},
		onSwipeBack(cb) {
			stackChrome?.onBack(cb);
			stackChrome?.onSwipeBack(cb);
		}
	};
}

export function showContentPane(paneEl: HTMLElement, visible: boolean): void {
	paneEl.toggleClass('is-hidden', !visible);
}
