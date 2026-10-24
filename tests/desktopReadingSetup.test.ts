// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mountDesktopReadingSetup } from '../src/ui/readerShell/desktopReadingSetup';
import { installObsidianDomExtensions } from './domExtensions';

beforeAll(() => installObsidianDomExtensions());

describe('desktop reading setup', () => {
	it('offers local, AI, and cache actions while reflecting preparation state', () => {
		const handlers = {
			onReadLocally: vi.fn(),
			onPrepareWithAi: vi.fn(),
			onClearCache: vi.fn()
		};
		const host = document.createElement('div');
		const handle = mountDesktopReadingSetup(host, handlers);
		handle.setVisible(true);

		const buttons = [...host.querySelectorAll('button')];
		const local = buttons.find((button) => button.textContent?.includes('Read locally'))!;
		const prepare = buttons.find((button) => button.textContent?.includes('Prepare with AI'))!;
		const clear = buttons.find((button) => button.textContent?.includes('Clear AI cache'))!;
		local.click();
		prepare.click();
		handle.setStatus('stale');
		expect(clear.classList.contains('is-hidden')).toBe(false);
		clear.click();

		expect(handlers.onReadLocally).toHaveBeenCalledOnce();
		expect(handlers.onPrepareWithAi).toHaveBeenCalledOnce();
		expect(handlers.onClearCache).toHaveBeenCalledOnce();
		expect(host.textContent).toContain('This note changed since it was prepared');
		handle.destroy();
	});
});

