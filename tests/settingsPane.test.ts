// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type SpeedReaderAiSettings } from '../src/types';
import { mountSettingsPane, type SettingsMutation } from '../src/ui/readerShell/panes/settingsPane';
import { mountShortcutsPane } from '../src/ui/readerShell/panes/shortcutsPane';
import { installObsidianDomExtensions } from './domExtensions';

beforeAll(() => installObsidianDomExtensions());
afterEach(() => vi.useRealTimers());

function rowWithLabel(root: HTMLElement, label: string): HTMLElement {
	const labelEl = [...root.querySelectorAll('.speed-reader-ai-settings-row-label')].find(
		(candidate) => candidate.textContent === label
	);
	const row = labelEl?.closest<HTMLElement>('.speed-reader-ai-settings-row');
	if (!row) {
		throw new Error(`Row not found: ${label}`);
	}
	return row;
}

function mount(settings: SpeedReaderAiSettings = structuredClone(DEFAULT_SETTINGS)) {
	const host = document.createElement('div');
	const mutations: SettingsMutation[] = [];
	const handle = mountSettingsPane(host, settings, { onChange: (mutate) => mutations.push(mutate) });
	/** Replay every reported mutation onto fresh defaults, like the modal does. */
	const applied = () => {
		const next = structuredClone(DEFAULT_SETTINGS);
		for (const mutate of mutations) {
			mutate(next);
		}
		return next;
	};
	return { host, handle, mutations, applied };
}

describe('settings pane', () => {
	it('applies a switch change immediately', () => {
		const { host, mutations, applied } = mount();
		const toggle = rowWithLabel(host, 'Progress bar').querySelector('input')!;
		toggle.checked = false;
		toggle.dispatchEvent(new Event('change'));
		expect(mutations).toHaveLength(1);
		expect(applied().reader.display.showProgress).toBe(false);
	});

	it('shows only the chunk control that fits the default mode', () => {
		const { host } = mount();
		const chunk = rowWithLabel(host, 'Words per chunk');
		const maxLength = rowWithLabel(host, 'Max word length');
		expect(chunk.hasClass('is-hidden')).toBe(false);
		expect(maxLength.hasClass('is-hidden')).toBe(true);

		host.querySelector<HTMLButtonElement>('[data-value="progressiveRsvp"]')!.click();
		expect(chunk.hasClass('is-hidden')).toBe(true);
		expect(maxLength.hasClass('is-hidden')).toBe(false);
	});

	it('shows the auto start delay only while auto start is on', () => {
		const { host } = mount();
		const delay = rowWithLabel(host, 'Start after');
		expect(delay.hasClass('is-hidden')).toBe(true);
		const toggle = rowWithLabel(host, 'Auto start').querySelector('input')!;
		toggle.checked = true;
		toggle.dispatchEvent(new Event('change'));
		expect(delay.hasClass('is-hidden')).toBe(false);
	});

	it('debounces slider drags into one save', () => {
		vi.useFakeTimers();
		const { host, mutations, applied } = mount();
		const slider = rowWithLabel(host, 'Word size').querySelector<HTMLInputElement>('input[type="range"]')!;
		for (const value of ['120', '140', '160']) {
			slider.value = value;
			slider.dispatchEvent(new Event('input'));
		}
		expect(mutations).toHaveLength(0);
		vi.advanceTimersByTime(300);
		expect(mutations).toHaveLength(1);
		expect(applied().reader.fontSize).toBe(160);
	});

	it('keeps the DOM when refreshed with unchanged settings', () => {
		const settings = structuredClone(DEFAULT_SETTINGS);
		const { host, handle } = mount(settings);
		const card = host.querySelector('.speed-reader-ai-settings-card');
		handle.refresh(structuredClone(settings));
		expect(host.querySelector('.speed-reader-ai-settings-card')).toBe(card);

		handle.refresh({ ...settings, reader: { ...settings.reader, wpm: 400 } });
		expect(host.querySelector('.speed-reader-ai-settings-card')).not.toBe(card);
	});

	it('resets pane fields only after a confirming second click', () => {
		const settings = structuredClone(DEFAULT_SETTINGS);
		settings.reader.wpm = 600;
		const { host, mutations } = mount(settings);
		const reset = () => host.querySelector<HTMLButtonElement>('.speed-reader-ai-settings-reset-all')!;
		reset().click();
		expect(mutations).toHaveLength(0);
		reset().click();
		expect(mutations).toHaveLength(1);
		const next = structuredClone(settings);
		next.reader.micropauseIntensity = 3;
		mutations[0]!(next);
		expect(next.reader.wpm).toBe(DEFAULT_SETTINGS.reader.wpm);
		expect(next.reader.micropauseIntensity).toBe(3);
	});
});

describe('shortcuts pane gestures', () => {
	it('lists touch gestures when asked', () => {
		const host = document.createElement('div');
		mountShortcutsPane(host, { showGestures: true });
		expect(host.querySelectorAll('.speed-reader-ai-shortcuts-gestures li').length).toBeGreaterThan(0);
	});
});
