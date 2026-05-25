import { describe, expect, it } from 'vitest';
import {
	isMobileStackRoute,
	mobileRouteToReaderTab,
	readerTabToMobileRoute
} from '../src/ui/readerShell/mobileNavigation';

describe('mobileNavigation', () => {
	it('maps home tab to reading route', () => {
		expect(readerTabToMobileRoute('home')).toBe('reading');
		expect(mobileRouteToReaderTab('reading')).toBe('home');
	});

	it('maps secondary tabs to matching stack routes', () => {
		expect(readerTabToMobileRoute('bookmarks')).toBe('bookmarks');
		expect(readerTabToMobileRoute('settings')).toBe('settings');
		expect(mobileRouteToReaderTab('content')).toBe('content');
	});

	it('identifies stack routes', () => {
		expect(isMobileStackRoute('reading')).toBe(false);
		expect(isMobileStackRoute('bookmarks')).toBe(true);
		expect(isMobileStackRoute('advanced')).toBe(true);
	});
});
