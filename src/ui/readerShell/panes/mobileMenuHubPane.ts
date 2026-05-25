import { MOBILE_ROUTE_LABELS, type MobileRoute } from '../mobileNavigation';
import { mountMobileStackChrome, type MobileStackChromeHandle } from '../mobileStackChrome';

const HUB_LINKS: { route: Exclude<MobileRoute, 'reading' | 'more' | 'bookmarks'>; label: string }[] =
	[
		{ route: 'content', label: MOBILE_ROUTE_LABELS.content },
		{ route: 'settings', label: MOBILE_ROUTE_LABELS.settings },
		{ route: 'shortcuts', label: MOBILE_ROUTE_LABELS.shortcuts },
		{ route: 'advanced', label: MOBILE_ROUTE_LABELS.advanced }
	];

const PREFERENCES_HUB_LINKS = HUB_LINKS.filter(
	(link) => link.route === 'settings' || link.route === 'advanced'
);

export interface MobileMenuHubPaneHandle {
	destroy(): void;
	setVisible(visible: boolean): void;
	onSwipeBack(cb: () => void): void;
}

export function mountMobileMenuHubPane(
	container: HTMLElement,
	options: {
		onSelectRoute: (route: MobileRoute) => void;
		preferencesOnly?: boolean;
	}
): MobileMenuHubPaneHandle {
	const pane = container.createDiv({
		cls: 'speed-reader-ai-pane speed-reader-ai-pane-more is-hidden'
	});

	const stackChrome = mountMobileStackChrome(pane, {
		title: 'Menu',
		scrollEl: pane
	});

	const body = pane.createDiv({ cls: 'speed-reader-ai-mobile-stack-body' });
	const list = body.createDiv({ cls: 'speed-reader-ai-mobile-menu-hub-list' });

	const links = options.preferencesOnly ? PREFERENCES_HUB_LINKS : HUB_LINKS;

	for (const link of links) {
		const btn = list.createEl('button', {
			cls: 'speed-reader-ai-mobile-menu-hub-btn',
			text: link.label,
			attr: { type: 'button' }
		});
		btn.addEventListener('click', () => {
			options.onSelectRoute(link.route);
		});
	}

	return {
		destroy() {
			stackChrome.destroy();
			pane.remove();
		},
		setVisible(visible) {
			pane.toggleClass('is-hidden', !visible);
		},
		onSwipeBack(cb) {
			stackChrome.onBack(cb);
		}
	};
}
