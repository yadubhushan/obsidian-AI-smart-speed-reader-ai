import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/services/eventBus';
import { ReaderGateImpl } from '../src/reader/ReaderGate';
import * as openBookReaderModule from '../src/reader/openBookReader';
import * as openNoteReaderModule from '../src/reader/openNoteReader';
import type { ManifestStore } from '../src/store/ManifestStore';
import type { BookCacheStore, ReadingStateStore } from '../src/types/m2Contracts';
import { DEFAULT_SETTINGS, type SpeedReaderAiSettings } from '../src/types';
import type { PreparePromptSet } from '../src/llm/promptCatalog';

import type { PluginServices } from '../src/services/serviceRegistry';

const noticeSpy = vi.fn();

vi.mock('obsidian', async () => {
	const actual = await vi.importActual<typeof import('obsidian')>('obsidian');
	class MockNotice {
		constructor(message: string) {
			noticeSpy(message);
		}
	}
	return {
		...actual,
		Notice: MockNotice
	};
});

vi.mock('../src/reader/openBookReader', () => ({
	openBookReader: vi.fn()
}));

vi.mock('../src/reader/openNoteReader', () => ({
	openNoteReader: vi.fn()
}));

const preparePrompts = {} as PreparePromptSet;
const services = {} as PluginServices;

function createMockStore(states: Record<string, import('../src/types/m2Contracts').ReadingState> = {}) {
	return {
		load: vi.fn().mockResolvedValue({
			lastGlobalSourcePath: '',
			sources: states
		}),
		reloadFromDisk: vi.fn().mockResolvedValue(true),
		isDirty: vi.fn(() => false),
		get: vi.fn(),
		upsert: vi.fn(),
		remove: vi.fn(),
		setLastGlobal: vi.fn(),
		flush: vi.fn(),
		onChanged: vi.fn(() => () => undefined)
	} as unknown as ReadingStateStore;
}

function createGate(
	settings: SpeedReaderAiSettings = DEFAULT_SETTINGS,
	readingStateStore: ReadingStateStore = createMockStore()
) {
	return new ReaderGateImpl({
		app: {} as import('obsidian').App,
		eventBus: new EventBus(),
		bookCacheStore: {} as BookCacheStore,
		readingStateStore,
		services,
		getSettings: () => settings,
		onSettingsChange: () => undefined,
		preparePrompts,
		getManifestStore: () => ({} as ManifestStore)
	});
}

describe('ReaderGate', () => {
	beforeEach(() => {
		vi.mocked(openBookReaderModule.openBookReader).mockReset();
		vi.mocked(openNoteReaderModule.openNoteReader).mockReset();
		noticeSpy.mockReset();
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

	it('blocks opening another book when completion gate is enabled', async () => {
		const readingStateStore = createMockStore({
			'books/current.epub': {
				sourcePath: 'books/current.epub',
				sourceKind: 'book',
				title: 'Current Book',
				folder: 'books',
				sourceChecksum: 'checksum-a',
				lastOpenedAt: '2026-06-04T12:00:00.000Z',
				pinned: false,
				status: 'in_progress',
				playbackMode: 'rsvp',
				position: { chapterId: 'c1', wordIndex: 10 },
				progressPercent: 42
			}
		});
		const settings: SpeedReaderAiSettings = {
			...DEFAULT_SETTINGS,
			reader: {
				...DEFAULT_SETTINGS.reader,
				requireCompletionBeforeNewBook: true
			}
		};
		const gate = createGate(settings, readingStateStore);

		await gate.open({ sourcePath: 'books/next.epub', sourceKind: 'book' });

		expect(openBookReaderModule.openBookReader).not.toHaveBeenCalled();
		expect(noticeSpy).toHaveBeenCalledWith(
			'Finish "Current Book" first (42%) or disable the setting in Speed Reader AI.'
		);
	});

	it('allows reopening the same in-progress book when completion gate is enabled', async () => {
		const readingStateStore = createMockStore({
			'books/current.epub': {
				sourcePath: 'books/current.epub',
				sourceKind: 'book',
				title: 'Current Book',
				folder: 'books',
				sourceChecksum: 'checksum-a',
				lastOpenedAt: '2026-06-04T12:00:00.000Z',
				pinned: false,
				status: 'in_progress',
				playbackMode: 'rsvp',
				position: { chapterId: 'c1', wordIndex: 10 },
				progressPercent: 42
			}
		});
		const settings: SpeedReaderAiSettings = {
			...DEFAULT_SETTINGS,
			reader: {
				...DEFAULT_SETTINGS.reader,
				requireCompletionBeforeNewBook: true
			}
		};
		const modal = { contentEl: { focus: vi.fn() }, close: vi.fn() };
		vi.mocked(openBookReaderModule.openBookReader).mockResolvedValue(modal as never);
		const gate = createGate(settings, readingStateStore);

		await gate.open({ sourcePath: 'books/current.epub', sourceKind: 'book' });

		expect(openBookReaderModule.openBookReader).toHaveBeenCalledTimes(1);
		expect(noticeSpy).not.toHaveBeenCalled();
	});
});
