import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/services/eventBus';
import { ReaderGateImpl } from '../src/reader/ReaderGate';
import * as openBookReaderModule from '../src/reader/openBookReader';
import * as openNoteReaderModule from '../src/reader/openNoteReader';
import type { ManifestStore } from '../src/store/ManifestStore';
import type { BookCacheStore, ReadingStateStore } from '../src/types/m2Contracts';
import type { SpeedReaderAiSettings } from '../src/types';
import type { PreparePromptSet } from '../src/llm/promptCatalog';

import type { PluginServices } from '../src/services/serviceRegistry';

vi.mock('../src/reader/openBookReader', () => ({
	openBookReader: vi.fn()
}));

vi.mock('../src/reader/openNoteReader', () => ({
	openNoteReader: vi.fn()
}));

const preparePrompts = {} as PreparePromptSet;
const testSettings = {} as SpeedReaderAiSettings;
const services = {} as PluginServices;

function createGate() {
	return new ReaderGateImpl({
		app: {} as import('obsidian').App,
		eventBus: new EventBus(),
		bookCacheStore: {} as BookCacheStore,
		readingStateStore: {} as ReadingStateStore,
		services,
		getSettings: () => testSettings,
		onSettingsChange: () => undefined,
		preparePrompts,
		getManifestStore: () => ({} as ManifestStore)
	});
}

describe('ReaderGate', () => {
	beforeEach(() => {
		vi.mocked(openBookReaderModule.openBookReader).mockReset();
		vi.mocked(openNoteReaderModule.openNoteReader).mockReset();
	});

	it('focuses existing modal when opening same source path', async () => {
		const focusSpy = vi.fn();
		const modal = { contentEl: { focus: focusSpy }, close: vi.fn() };
		vi.mocked(openBookReaderModule.openBookReader).mockResolvedValue(modal as never);

		const gate = createGate();
		await gate.open({ sourcePath: 'books/a.epub', sourceKind: 'book' });
		await gate.open({ sourcePath: 'books/a.epub', sourceKind: 'book' });

		expect(focusSpy).toHaveBeenCalled();
		expect(openBookReaderModule.openBookReader).toHaveBeenCalledTimes(1);
	});

	it('closes previous modal when opening different source path', async () => {
		const closeSpy = vi.fn();
		const modal = { contentEl: { focus: vi.fn() }, close: closeSpy };
		vi.mocked(openBookReaderModule.openBookReader).mockResolvedValue(modal as never);

		const gate = createGate();
		await gate.open({ sourcePath: 'books/a.epub', sourceKind: 'book' });
		await gate.open({ sourcePath: 'books/b.epub', sourceKind: 'book' });

		expect(closeSpy).toHaveBeenCalled();
		expect(openBookReaderModule.openBookReader).toHaveBeenCalledTimes(2);
		expect(gate.getActiveSourcePath()).toBe('books/b.epub');
	});

	it('opens notes via openNoteReader', async () => {
		const modal = { contentEl: { focus: vi.fn() }, close: vi.fn() };
		vi.mocked(openNoteReaderModule.openNoteReader).mockResolvedValue(modal as never);

		const gate = createGate();
		await gate.open({
			sourcePath: 'notes/chapter.md',
			sourceKind: 'note',
			initialPosition: { sectionId: 's1', wordIndex: 2 }
		});

		expect(openNoteReaderModule.openNoteReader).toHaveBeenCalledTimes(1);
		expect(gate.getActiveSourcePath()).toBe('notes/chapter.md');
	});
});
