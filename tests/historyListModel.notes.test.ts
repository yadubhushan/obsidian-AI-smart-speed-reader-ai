import { describe, expect, it } from 'vitest';
import {
	buildNoteDashboardSections,
	buildNoteHistoryModel,
	noteBadgeFromIndex,
	noteLengthLabelFromProcessed,
	type NoteHistoryRow
} from '../src/history/historyListModel';
import type { DocumentCacheIndex, ProcessedDocument } from '../src/types/processedDocument';
import type { ReadingState, ReadingStateFile } from '../src/types/m2Contracts';

function noteState(sourcePath: string, overrides: Partial<ReadingState> = {}): ReadingState {
	return {
		sourcePath,
		sourceKind: 'note',
		title: overrides.title ?? sourcePath,
		folder: overrides.folder ?? 'notes',
		sourceChecksum: 'abc',
		lastOpenedAt: overrides.lastOpenedAt ?? '2026-05-20T10:00:00.000Z',
		pinned: overrides.pinned ?? false,
		status: overrides.status ?? 'in_progress',
		playbackMode: 'rsvp',
		position: { sectionId: 'intro', wordIndex: 4 },
		progressPercent: overrides.progressPercent ?? 25,
		...overrides
	};
}

describe('historyListModel notes', () => {
	it('includes only note kind with in_progress or finished', async () => {
		const file: ReadingStateFile = {
			lastGlobalSourcePath: 'notes/active.md',
			sources: {
				'notes/active.md': noteState('notes/active.md', { title: 'Active Note' }),
				'books/half.epub': noteState('books/half.epub', {
					sourceKind: 'book',
					status: 'in_progress'
				}),
				'notes/draft.md': noteState('notes/draft.md', {
					status: 'unread'
				}),
				'notes/done.md': noteState('notes/done.md', {
					title: 'Done Note',
					status: 'finished',
					progressPercent: 100
				})
			}
		};

		const rows = await buildNoteHistoryModel(file, async () => null);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.sourcePath).sort()).toEqual([
			'notes/active.md',
			'notes/done.md'
		]);
	});

	it('derives AI ready vs Deterministic badge from manifest index', () => {
		const readyIndex: DocumentCacheIndex = {
			version: 2,
			sourcePath: 'notes/ready.md',
			sourceChecksum: 'x',
			activeProcessingMode: 'sections',
			activeVersionId: 'v1',
			nextVersionNumber: 2,
			versions: [
				{
					id: 'v1',
					number: 1,
					modeId: 'sections',
					preparedAt: '2026-05-01T00:00:00.000Z',
					model: 'gpt',
					sourceChecksum: 'x',
					status: 'ready'
				}
			],
			updatedAt: '2026-05-01T00:00:00.000Z'
		};
		const staleIndex: DocumentCacheIndex = {
			...readyIndex,
			versions: [{ ...readyIndex.versions[0]!, status: 'stale' }]
		};

		expect(noteBadgeFromIndex(readyIndex)).toBe('ai');
		expect(noteBadgeFromIndex(staleIndex)).toBe('deterministic');
		expect(noteBadgeFromIndex(null)).toBe('deterministic');
	});

	it('maps note row fields from reading state', async () => {
		const file: ReadingStateFile = {
			lastGlobalSourcePath: '',
			sources: {
				'notes/pinned.md': noteState('notes/pinned.md', {
					title: 'Pinned',
					pinned: true,
					pinnedAt: '2026-05-19T08:00:00.000Z',
					progressPercent: 55
				})
			}
		};

		const rows = await buildNoteHistoryModel(file, async () => null);
		const row = rows[0] as NoteHistoryRow;
		expect(row.title).toBe('Pinned');
		expect(row.pinned).toBe(true);
		expect(row.badge).toBe('deterministic');
		expect(row.position).toEqual({ sectionId: 'intro', wordIndex: 4 });
		expect(row.progressPercent).toBe(55);
		expect(row.lengthLabel).toBe('Ready to read');
	});

	it('derives smart length labels for sections and single-story documents', () => {
		const sectionsDoc: ProcessedDocument = {
			kind: 'sections',
			processorId: 'sections',
			meta: {
				sourcePath: 'notes/ready.md',
				sourceChecksum: 'x',
				processedAt: '2026-05-01T00:00:00.000Z',
				model: 'gpt',
				prepareStrategy: 'single'
			},
			sections: [
				{ sectionId: 'a', title: 'A', stream: [] },
				{ sectionId: 'b', title: 'B', stream: [] }
			]
		};
		const storyDoc: ProcessedDocument = {
			kind: 'single_story',
			processorId: 'single_story',
			meta: {
				sourcePath: 'notes/story.md',
				sourceChecksum: 'x',
				processedAt: '2026-05-01T00:00:00.000Z',
				model: 'gpt',
				prepareStrategy: 'single'
			},
			stream: Array.from({ length: 440 }, () => ({ kind: 'word' as const, text: 'word' }))
		};

		expect(noteLengthLabelFromProcessed(sectionsDoc)).toBe('2 sections');
		expect(noteLengthLabelFromProcessed(storyDoc)).toBe('2 min read');
	});

	it('builds pinned and in-progress shelves for notes without duplicates', () => {
		const rows: NoteHistoryRow[] = [
			{
				sourcePath: 'notes/pinned.md',
				title: 'Pinned',
				folder: 'notes',
				status: 'in_progress',
				progressPercent: 55,
				lastOpenedAt: '2026-05-20T10:00:00.000Z',
				pinned: true,
				pinnedAt: '2026-05-19T08:00:00.000Z',
				docKey: 'p',
				badge: 'ai',
				badgeLabel: 'AI ready',
				position: { sectionId: 'intro', wordIndex: 4 },
				typeLabel: 'Note',
				lengthLabel: '3 sections',
				lastReadLabel: 'Last read yesterday',
				progressLabel: '55% complete',
				surfaceKind: 'note',
				isContinueTarget: false
			},
			{
				sourcePath: 'notes/active.md',
				title: 'Active',
				folder: 'notes',
				status: 'in_progress',
				progressPercent: 20,
				lastOpenedAt: '2026-05-18T10:00:00.000Z',
				pinned: false,
				docKey: 'a',
				badge: 'deterministic',
				badgeLabel: 'Deterministic',
				position: { sectionId: 'intro', wordIndex: 2 },
				typeLabel: 'Note',
				lengthLabel: '1 min read',
				lastReadLabel: 'Last read 2 days ago',
				progressLabel: '20% complete',
				surfaceKind: 'note',
				isContinueTarget: false
			}
		];

		const sections = buildNoteDashboardSections(rows, {
			inProgress: true,
			pinned: true,
			finished: false
		}, '');

		expect(sections.map((section) => section.title)).toEqual(['Pinned', 'In Progress']);
		expect(sections[0]?.rows.map((row) => row.title)).toEqual(['Pinned']);
		expect(sections[1]?.rows.map((row) => row.title)).toEqual(['Active']);
	});
});
