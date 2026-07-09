import type { ReaderTabId } from './readerTabDock';

export type MobileRoute =
	| 'reading'
	| 'more'
	| 'bookmarks'
	| 'content'
	| 'settings'
	| 'shortcuts';

export const MOBILE_STACK_ROUTES: ReadonlySet<MobileRoute> = new Set([
	'more',
	'bookmarks',
	'content',
	'settings',
	'shortcuts'
]);

export const MOBILE_ROUTE_LABELS: Record<MobileRoute, string> = {
	reading: 'Reading',
	more: 'Menu',
	bookmarks: 'Bookmarks',
	content: 'Content',
	settings: 'Settings',
	shortcuts: 'Shortcuts'
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

/**
 * Route-stack transition for navigating to a route:
 * - 'reading' resets to the root
 * - a sibling opened from 'reading' starts a fresh stack ('bookmarks' and
 *   'more' sit directly above the root; anything else nests under 'more')
 * - routes opened from 'more' stack on top; siblings replace each other
 */
export function pushRouteStack(
	stack: readonly MobileRoute[],
	route: MobileRoute
): MobileRoute[] {
	if (route === 'reading') {
		return ['reading'];
	}
	const top = stack[stack.length - 1] ?? 'reading';
	if (top === route) {
		return [...stack];
	}
	if (top === 'reading') {
		if (route === 'bookmarks') {
			return ['reading', 'bookmarks'];
		}
		if (route === 'more') {
			return ['reading', 'more'];
		}
		return ['reading', 'more', route];
	}
	if (top === 'more') {
		return [...stack, route];
	}
	return [...stack.slice(0, -1), route];
}

/** Pops one route; an empty or single-entry stack resolves to the reading root. */
export function popRouteStack(stack: readonly MobileRoute[]): {
	stack: MobileRoute[];
	route: MobileRoute;
} {
	if (stack.length <= 1) {
		return { stack: ['reading'], route: 'reading' };
	}
	const next = stack.slice(0, -1);
	return { stack: next, route: next[next.length - 1] ?? 'reading' };
}
