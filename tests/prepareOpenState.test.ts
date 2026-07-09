import { describe, expect, it, vi } from 'vitest';
import {
	prepareBookOpenState,
	prepareNoteOpenState
} from '../src/features/feature2/registerFeature2';
import type { PluginServices } from '../src/services/serviceRegistry';
import type {
	ReadingState,
	ReadingStateFile,
	ReadingStateStore
} from '../src/types/m2Contracts';

function noteState(sourcePath: string, sourceChecksum = 'same-content'): ReadingState {
	return {
		sourcePath,
		sourceKind: 'note',
		title: 'Moved note',
		folder: 'old',
		sourceChecksum,
		lastOpenedAt: '2026-07-01T00:00:00.000Z',
		pinned: false,
		status: 'in_progress',
		playbackMode: 'rsvp',
		position: { sectionId: 'intro', wordIndex: 42 },
		progressPercent: 37
	};
}

function servicesWith(states: ReadingState[]): {
	services: PluginServices;
	store: ReadingStateStore;
	file: ReadingStateFile;
} {
	const file: ReadingStateFile = {
		lastGlobalSourcePath: states[0]?.sourcePath ?? '',
		sources: Object.fromEntries(states.map((state) => [state.sourcePath, state]))
	};
	const store: ReadingStateStore = {
		load: vi.fn(async () => file),
		reloadFromDisk: vi.fn(async () => true),
		isDirty: vi.fn(() => false),
		get: vi.fn((path) => file.sources[path]),
		upsert: vi.fn(async (state) => {
			file.sources[state.sourcePath] = state;
		}),
		remove: vi.fn(async (path) => {
			delete file.sources[path];
		}),
		setLastGlobal: vi.fn(async (path) => {
			file.lastGlobalSourcePath = path;
		}),
		flush: vi.fn(async () => undefined),
		onChanged: vi.fn(() => () => undefined)
	};
	return {
		services: { readingStateStore: store } as PluginServices,
		store,
		file
	};
}

describe('prepareOpenState move recovery', () => {
	it('moves note reading state to a new path when its checksum uniquely matches', async () => {
		const oldState = noteState('old/folder/note.md');
		const { services, store, file } = servicesWith([oldState]);

		const result = await prepareNoteOpenState({
			sourcePath: 'new/folder/note.md',
			sourceChecksum: oldState.sourceChecksum,
			services
		});

		expect(result).toEqual({
			existingState: { ...oldState, sourcePath: 'new/folder/note.md' },
			checksumReset: false
		});
		expect(store.remove).toHaveBeenCalledWith('old/folder/note.md');
		expect(store.upsert).toHaveBeenCalledWith({
			...oldState,
			sourcePath: 'new/folder/note.md'
		});
		expect(file.sources['old/folder/note.md']).toBeUndefined();
		expect(file.lastGlobalSourcePath).toBe('new/folder/note.md');
	});

	it('does not guess when multiple states have the same checksum', async () => {
		const first = noteState('copies/one.md');
		const second = noteState('copies/two.md');
		const { services, store } = servicesWith([first, second]);

		const result = await prepareNoteOpenState({
			sourcePath: 'notes/new.md',
			sourceChecksum: first.sourceChecksum,
			services
		});

		expect(result).toEqual({ existingState: undefined, checksumReset: false });
		expect(store.remove).not.toHaveBeenCalled();
		expect(store.upsert).not.toHaveBeenCalled();
	});

	it('does not reuse a note state for a book with the same checksum', async () => {
		const state = noteState('notes/source.md');
		const { services, store } = servicesWith([state]);

		const result = await prepareBookOpenState({
			sourcePath: 'books/source.epub',
			sourceChecksum: state.sourceChecksum,
			services
		});

		expect(result.existingState).toBeUndefined();
		expect(store.remove).not.toHaveBeenCalled();
	});
});
