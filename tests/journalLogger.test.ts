import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasReadingHabitLoggedToday, logReadingSessionToJournal } from '../src/services/journalLogger';

describe('journalLogger', () => {
	beforeEach(() => {
		vi.stubGlobal('window', {
			moment: () => ({
				format: (value: string) => (value === 'YYYY-MM-DD' ? '2026-06-06' : '09:30')
			})
		});
	});

	it('marks the reading habit in frontmatter without appending a daily log entry', async () => {
		const files = new Map<string, string>([
			[
				'code/journal_manager/Trackers.yaml',
				[
					'- name: "protein"',
					'  emoji: "🥩"',
					'  weekly_target: 5',
					'  types:',
					'    - "protein"',
					'- name: "reading"',
					'  emoji: "📖"',
					'  weekly_target: 5',
					'  types:',
					'    - "reading"'
				].join('\n')
			],
			[
				'journal/daily/2026-06-06.md',
				[
					'# Life Trackers',
					'',
					'| Category | Activity | Status |',
					'| --- | --- | --- |',
					'| **🥩 Protein** | Protein | `INPUT[toggle:habits.protein]` |',
					'| **End of the day** | └─ Feeling | `INPUT[slider(minValue(1), maxValue(5)):feeling_rating]` |',
					'',
					'# Daily Log',
					'',
					'- ',
					''
				].join('\n')
			]
		]);
		const frontmatter = { habits: { protein: false } };
		const fileManager = {
			processFrontMatter: vi.fn(async (_file, updater) => {
				updater(frontmatter);
			})
		};
		const vault = {
			getAbstractFileByPath: vi.fn((path: string) => ({ path })),
			read: vi.fn(async (file: { path: string }) => files.get(file.path) ?? ''),
			modify: vi.fn(async (file: { path: string }, value: string) => {
				files.set(file.path, value);
			})
		};

		const logged = await logReadingSessionToJournal(
			{ vault, fileManager } as never,
			6 * 60 * 1000,
			'Deep Work',
			8 * 60 * 1000
		);

		expect(logged).toBe(true);
		expect(frontmatter.habits.reading).toBe(true);
		const journal = files.get('journal/daily/2026-06-06.md') ?? '';
		expect(journal).not.toContain('| **📖 Reading** | Reading | `INPUT[toggle:habits.reading]` |');
		expect(journal).not.toContain('- `09:30` 📖 Read **Deep Work** for 8 min');
		expect(vault.modify).not.toHaveBeenCalled();
	});

	it('does not log when played time is below two minutes', async () => {
		const fileManager = {
			processFrontMatter: vi.fn()
		};
		const vault = {
			getAbstractFileByPath: vi.fn((path: string) => ({ path })),
			read: vi.fn(),
			modify: vi.fn()
		};

		const logged = await logReadingSessionToJournal(
			{ vault, fileManager } as never,
			119 * 1000,
			'Deep Work'
		);

		expect(logged).toBe(false);
		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(vault.modify).not.toHaveBeenCalled();
	});

	it('does not add a duplicate log when reading is already marked today', async () => {
		const fileManager = {
			processFrontMatter: vi.fn()
		};
		const vault = {
			getAbstractFileByPath: vi.fn((path: string) => ({ path })),
			read: vi.fn(async (file: { path: string }) => {
				if (file.path === 'code/journal_manager/Trackers.yaml') {
					return ['- name: "reading"', '  emoji: "📖"', '  types:', '    - "reading"'].join('\n');
				}
				return [
					'---',
					'habits:',
					'  reading: true',
					'---',
					'',
					'# Daily Log'
				].join('\n');
			}),
			modify: vi.fn()
		};

		const logged = await logReadingSessionToJournal(
			{ vault, fileManager } as never,
			2 * 60 * 1000,
			'Deep Work'
		);

		expect(logged).toBe(false);
		expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(vault.modify).not.toHaveBeenCalled();
	});

	it('detects when the reading habit is already logged for today', async () => {
		const vault = {
			getAbstractFileByPath: vi.fn((path: string) => ({ path })),
			read: vi.fn(async (file: { path: string }) => {
				if (file.path === 'code/journal_manager/Trackers.yaml') {
					return ['- name: "reading"', '  emoji: "📖"', '  types:', '    - "reading"'].join('\n');
				}
				return [
					'---',
					'habits:',
					'  reading: true',
					'---',
					'',
					'# Daily Log'
				].join('\n');
			})
		};

		await expect(hasReadingHabitLoggedToday({ vault } as never)).resolves.toBe(true);
	});
});
