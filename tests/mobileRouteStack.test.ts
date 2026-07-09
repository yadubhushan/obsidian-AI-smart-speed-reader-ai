import { describe, expect, it } from 'vitest';
import {
	popRouteStack,
	pushRouteStack,
	type MobileRoute
} from '../src/ui/readerShell/mobileNavigation';

describe('pushRouteStack', () => {
	it('resets to the root when navigating to reading', () => {
		expect(pushRouteStack(['reading', 'more', 'settings'], 'reading')).toEqual(['reading']);
	});

	it('keeps the stack when re-navigating to the current top', () => {
		const stack: MobileRoute[] = ['reading', 'bookmarks'];
		expect(pushRouteStack(stack, 'bookmarks')).toEqual(['reading', 'bookmarks']);
	});

	it('opens bookmarks and more directly above the root', () => {
		expect(pushRouteStack(['reading'], 'bookmarks')).toEqual(['reading', 'bookmarks']);
		expect(pushRouteStack(['reading'], 'more')).toEqual(['reading', 'more']);
	});

	it('nests deep routes under more when opened from the root', () => {
		expect(pushRouteStack(['reading'], 'settings')).toEqual(['reading', 'more', 'settings']);
	});

	it('stacks routes opened from the more hub', () => {
		expect(pushRouteStack(['reading', 'more'], 'settings')).toEqual([
			'reading',
			'more',
			'settings'
		]);
	});

	it('replaces the top when switching between sibling panes', () => {
		expect(pushRouteStack(['reading', 'more', 'settings'], 'shortcuts')).toEqual([
			'reading',
			'more',
			'shortcuts'
		]);
		expect(pushRouteStack(['reading', 'bookmarks'], 'content')).toEqual([
			'reading',
			'content'
		]);
	});

	it('does not mutate the input stack', () => {
		const stack: MobileRoute[] = ['reading', 'more'];
		pushRouteStack(stack, 'settings');
		expect(stack).toEqual(['reading', 'more']);
	});
});

describe('popRouteStack', () => {
	it('pops back to the previous route', () => {
		expect(popRouteStack(['reading', 'more', 'settings'])).toEqual({
			stack: ['reading', 'more'],
			route: 'more'
		});
		expect(popRouteStack(['reading', 'bookmarks'])).toEqual({
			stack: ['reading'],
			route: 'reading'
		});
	});

	it('resolves an exhausted stack to the reading root', () => {
		expect(popRouteStack(['reading'])).toEqual({ stack: ['reading'], route: 'reading' });
		expect(popRouteStack([])).toEqual({ stack: ['reading'], route: 'reading' });
	});

	it('does not mutate the input stack', () => {
		const stack: MobileRoute[] = ['reading', 'more', 'settings'];
		popRouteStack(stack);
		expect(stack).toEqual(['reading', 'more', 'settings']);
	});
});
