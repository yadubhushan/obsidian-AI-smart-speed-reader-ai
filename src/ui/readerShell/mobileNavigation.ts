import type { ReaderTabId } from './readerTabDock';

export type MobileRoute =
	| 'reading'
	| 'more'
	| 'bookmarks'
	| 'content'
	| 'settings'
	| 'shortcuts'
	| 'advanced';

export const MOBILE_STACK_ROUTES: ReadonlySet<MobileRoute> = new Set([
	'more',
	'bookmarks',
	'content',
	'settings',
	'shortcuts',
	'advanced'
]);

export const MOBILE_ROUTE_LABELS: Record<MobileRoute, string> = {
	reading: 'Reading',
	more: 'Menu',
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

export function mobileRouteToReaderTab(route: MobileRoute): ReaderTabId | null {
	if (route === 'reading' || route === 'more') {
		return route === 'reading' ? 'home' : null;
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

export function isMobileReadingRoot(route: MobileRoute): boolean {
	return route === 'reading';
}
