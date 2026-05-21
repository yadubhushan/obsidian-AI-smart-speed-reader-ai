import { describe, expect, it } from 'vitest';
import {
	applyHistoryFilters,
	canPinMore,
	countPinnedSources,
	defaultHistoryFilters,
	rowMatchesHistoryFilters,
	tryPinState
} from '../src/history/historyFilters';
import type { ReadingState, ReadingStateFile } from '../src/types/m2Contracts';

function noteState(sourcePath: string, overrides: Partial<ReadingState> = {}): ReadingState {
	return {
		sourcePath,
		sourceKind: 'note',
		title: sourcePath,
		folder: '/',
		sourceChecksum: 'x',
		lastOpenedAt: '2026-05-01T00:00:00.000Z',
		pinned: false,
		status: 'in_progress',
		playbackMode: 'rsvp',
		position: { sectionId: 's1', wordIndex: 0 },
		progressPercent: 10,
		...overrides
	};
}

describe('historyFilters', () => {
	it('defaults to in progress only', () => {
		expect(defaultHistoryFilters()).toEqual({
			inProgress: true,
			pinned: false,
			finished: false
		});
	});

	it('matches rows by selected chips (union)', () => {
		const filters = { inProgress: true, pinned: true, finished: false };
		expect(
			rowMatchesHistoryFilters(
				{ sourcePath: 'a', status: 'in_progress', pinned: true },
				filters
			)
		).toBe(true);
		expect(
			rowMatchesHistoryFilters(
				{ sourcePath: 'b', status: 'finished', pinned: false },
				filters
			)
		).toBe(false);
		expect(
			rowMatchesHistoryFilters(
				{ sourcePath: 'c', status: 'finished', pinned: true },
				filters
			)
		).toBe(true);
	});

	it('applyHistoryFilters keeps in-progress and finished when both selected', () => {
		const rows = [
			{ sourcePath: 'a', status: 'in_progress' as const, pinned: false },
			{ sourcePath: 'b', status: 'finished' as const, pinned: false },
			{ sourcePath: 'c', status: 'unread' as const, pinned: false }
		];
		const filtered = applyHistoryFilters(rows, {
			inProgress: true,
			pinned: false,
			finished: true
		});
		expect(filtered.map((row) => row.sourcePath)).toEqual(['a', 'b']);
	});

	it('rejects sixth pin', () => {
		const file: ReadingStateFile = {
			lastGlobalSourcePath: '',
			sources: {
				'n1.md': noteState('n1.md', { pinned: true }),
				'n2.md': noteState('n2.md', { pinned: true }),
				'n3.md': noteState('n3.md', { pinned: true }),
				'n4.md': noteState('n4.md', { pinned: true }),
				'n5.md': noteState('n5.md', { pinned: true })
			}
		};
		expect(countPinnedSources(file)).toBe(5);
		expect(canPinMore(file)).toBe(false);

		const sixth = noteState('n6.md');
		const result = tryPinState(sixth, file);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe('limit');
		}
	});

	it('allows unpin then pin another', () => {
		const file: ReadingStateFile = {
			lastGlobalSourcePath: '',
			sources: {
				'n1.md': noteState('n1.md', { pinned: true }),
				'n2.md': noteState('n2.md', { pinned: true }),
				'n3.md': noteState('n3.md', { pinned: true }),
				'n4.md': noteState('n4.md', { pinned: true }),
				'n5.md': noteState('n5.md', { pinned: true })
			}
		};
		const unpin = tryPinState(file.sources['n1.md'], file);
		expect(unpin.ok).toBe(true);
		if (unpin.ok) {
			expect(unpin.state.pinned).toBe(false);
		}
	});
});
