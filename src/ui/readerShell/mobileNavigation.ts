import type { ReaderTabId } from './readerTabDock';

export type MobileRoute =
	| 'reading'
	| 'bookmarks'
	| 'content'
	| 'settings'
	| 'shortcuts'
	| 'advanced';

export const MOBILE_STACK_ROUTES: ReadonlySet<MobileRoute> = new Set([
	'bookmarks',
	'content',
	'settings',
	'shortcuts',
	'advanced'
]);

export const MOBILE_ROUTE_LABELS: Record<MobileRoute, string> = {
	reading: 'Reading',
	bookmarks: 'Bookmarks',
	content: 'Content',
	settings: 'Settings',
	shortcuts: 'Shortcuts',
	advanced: 'Advanced'
};

export function readerTabToMobileRoute(tab: ReaderTabId): MobileRoute {
	if (tab === 'home') {
		return 'reading';
	}
	return tab;
}

export function mobileRouteToReaderTab(route: MobileRoute): ReaderTabId {
	if (route === 'reading') {
		return 'home';
	}
	return route;
}

export function isMobileStackRoute(route: MobileRoute): boolean {
	return MOBILE_STACK_ROUTES.has(route);
}

export function syncMobileRouteShell(shellEl: HTMLElement, route: MobileRoute): void {
	for (const candidate of MOBILE_STACK_ROUTES) {
		shellEl.removeClass(`speed-reader-ai-mobile-route-${candidate}`);
	}
	shellEl.removeClass('speed-reader-ai-mobile-route-reading');
	shellEl.removeClass('speed-reader-ai-mobile-bookmarks');
	shellEl.addClass(`speed-reader-ai-mobile-route-${route}`);
	shellEl.setAttr('data-mobile-route', route);
}
