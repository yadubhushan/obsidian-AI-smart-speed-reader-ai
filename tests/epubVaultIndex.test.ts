import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { TFile } from 'obsidian';
import { EventBus } from '../src/services/eventBus';
import { EpubVaultIndexImpl } from '../src/history/epubVaultIndex';

function mockEpubFile(path: string): TFile {
	return { path, extension: 'epub' } as TFile;
}

function createMockApp(files: TFile[]) {
	return {
		vault: {
			getFiles: () => files
		}
	} as import('obsidian').App;
}

describe('EpubVaultIndex', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('scans vault for epub files on construction', () => {
		const eventBus = new EventBus();
		const index = new EpubVaultIndexImpl(
			createMockApp([
				mockEpubFile('books/a.epub'),
				{ path: 'notes/readme.md', extension: 'md' } as TFile,
				mockEpubFile('archive/b.epub')
			]),
			eventBus
		);

		expect(index.getAll()).toEqual([
			{ sourcePath: 'archive/b.epub', title: 'b', folder: 'archive' },
			{ sourcePath: 'books/a.epub', title: 'a', folder: 'books' }
		]);
	});

	it('emits epub-index-changed when refresh detects changes', () => {
		let files = [mockEpubFile('books/a.epub')];
		const eventBus = new EventBus();
		const handler = vi.fn();
		eventBus.on('epub-index-changed', handler);

		const index = new EpubVaultIndexImpl(
			{ vault: { getFiles: () => files } } as import('obsidian').App,
			eventBus
		);
		handler.mockClear();

		files = [mockEpubFile('books/a.epub'), mockEpubFile('books/b.epub')];
		index.refresh();

		expect(handler).toHaveBeenCalledTimes(1);
		expect(index.get('books/b.epub')).toEqual({
			sourcePath: 'books/b.epub',
			title: 'b',
			folder: 'books'
		});
	});

	it('notifies onChanged subscribers', () => {
		let files = [mockEpubFile('books/a.epub')];
		const eventBus = new EventBus();
		const index = new EpubVaultIndexImpl(
			{ vault: { getFiles: () => files } } as import('obsidian').App,
			eventBus
		);
		const subscriber = vi.fn();
		index.onChanged(subscriber);
		subscriber.mockClear();

		files = [];
		index.refresh();

		expect(subscriber).toHaveBeenCalledTimes(1);
	});

	it('debounces rename-triggered rebuilds', () => {
		let files = [mockEpubFile('books/a.epub')];
		const eventBus = new EventBus();
		const handler = vi.fn();
		eventBus.on('epub-index-changed', handler);

		const renameHandlers: Array<(file: TFile, oldPath: string) => void> = [];
		const app = {
			vault: {
				getFiles: () => files,
				on: (event: string, cb: (file: TFile, oldPath: string) => void) => {
					if (event === 'rename') {
						renameHandlers.push(cb);
					}
					return { off: () => undefined };
				}
			}
		} as unknown as import('obsidian').App;

		const index = new EpubVaultIndexImpl(app, eventBus);
		index.registerVaultListeners({
			registerEvent: (ref: { off: () => void }) => ref
		} as import('obsidian').Plugin);

		handler.mockClear();
		for (const cb of renameHandlers) {
			cb(mockEpubFile('books/renamed.epub'), 'books/a.epub');
			cb(mockEpubFile('books/renamed.epub'), 'books/a.epub');
		}
		files = [mockEpubFile('books/renamed.epub')];

		expect(handler).not.toHaveBeenCalled();
		vi.advanceTimersByTime(300);
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
