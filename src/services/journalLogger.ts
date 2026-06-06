import type { App, TFile } from 'obsidian';

const MIN_READING_MS = 2 * 60 * 1000; // 2 minutes
const TRACKERS_PATH = 'code/journal_manager/Trackers.yaml';

interface TrackerTypeConfig {
	key: string;
	archived: boolean;
}

interface TrackerConfig {
	name: string;
	label?: string;
	emoji?: string;
	archived: boolean;
	types: TrackerTypeConfig[];
}

interface ReadingTrackerConfig {
	activityKey: string;
}

interface TodayReadingJournalContext {
	file: TFile;
	tracker: ReadingTrackerConfig;
	content: string;
}

export async function logReadingSessionToJournal(
	app: App,
	longestContinuousPlayedMs: number,
	_title: string,
	_totalPlayedMs = longestContinuousPlayedMs
): Promise<boolean> {
	if (longestContinuousPlayedMs < MIN_READING_MS) return false;
	if (await hasReadingHabitLoggedToday(app)) return false;

	const journal = await getTodayReadingJournalContext(app);
	if (!journal) return false;
	const { file, tracker } = journal;

	await app.fileManager.processFrontMatter(file, (fm) => {
		fm['habits'] = fm['habits'] ?? {};
		fm['habits'][tracker.activityKey] = true;
	});
	return true;
}

export async function hasReadingHabitLoggedToday(app: App): Promise<boolean> {
	const journal = await getTodayReadingJournalContext(app);
	if (!journal) {
		return false;
	}

	const escapedKey = escapeRegExp(journal.tracker.activityKey);
	const frontmatterMatch = journal.content.match(/^---\n([\s\S]*?)\n---/);
	if (!frontmatterMatch) {
		return false;
	}

	const habitsBlockMatch = frontmatterMatch[1]?.match(
		new RegExp(`(?:^|\\n)habits:\\n([\\s\\S]*?)(?:\\n[^\\s]|$)`)
	);
	if (!habitsBlockMatch?.[1]) {
		return false;
	}

	return new RegExp(`^\\s{2,}${escapedKey}:\\s*true\\s*$`, 'm').test(habitsBlockMatch[1]);
}

async function getTodayReadingJournalContext(app: App): Promise<TodayReadingJournalContext | null> {
	const today = window.moment().format('YYYY-MM-DD');
	const journalPath = `journal/daily/${today}.md`;
	const file = app.vault.getAbstractFileByPath(journalPath) as TFile | null;
	if (!file) {
		return null;
	}

	const tracker = await resolveReadingTrackerConfig(app);
	const content = await app.vault.read(file);
	return { file, tracker, content };
}

async function resolveReadingTrackerConfig(app: App): Promise<ReadingTrackerConfig> {
	const fallback: ReadingTrackerConfig = {
		activityKey: 'reading'
	};
	const trackerFile = app.vault.getAbstractFileByPath(TRACKERS_PATH) as TFile | null;
	if (!trackerFile) {
		return fallback;
	}

	try {
		const raw = await app.vault.read(trackerFile);
		const trackers = parseTrackers(raw);
		const readingTracker = trackers.find((tracker) => {
			if (tracker.archived) {
				return false;
			}
			if (tracker.name === 'reading') {
				return tracker.types.some((type) => type.key === 'reading' && !type.archived);
			}
			return tracker.types.some((type) => type.key === 'reading' && !type.archived);
		});
		if (!readingTracker) {
			return fallback;
		}
		const activeReadingType =
			readingTracker.types.find((type) => type.key === 'reading' && !type.archived) ??
			readingTracker.types.find((type) => !type.archived);
		if (!activeReadingType) {
			return fallback;
		}
		return {
			activityKey: activeReadingType.key
		};
	} catch {
		return fallback;
	}
}

function parseTrackers(raw: string): TrackerConfig[] {
	const trackers: TrackerConfig[] = [];
	let current: TrackerConfig | null = null;
	let currentType: TrackerTypeConfig | null = null;
	let inTypes = false;

	for (const line of raw.split(/\r?\n/)) {
		const topLevelName = line.match(/^- name:\s*(.+)\s*$/);
		if (topLevelName) {
			if (current) {
				trackers.push(current);
			}
			current = {
				name: parseScalar(topLevelName[1] ?? ''),
				archived: false,
				types: []
			};
			currentType = null;
			inTypes = false;
			continue;
		}
		if (!current) {
			continue;
		}

		if (/^ {2}types:\s*$/.test(line)) {
			inTypes = true;
			currentType = null;
			continue;
		}

		if (/^ {2}\S/.test(line)) {
			inTypes = false;
			currentType = null;
		}

		const archived = line.match(/^ {2}archived:\s*(.+)\s*$/);
		if (archived) {
			current.archived = parseBoolean(archived[1] ?? '');
			continue;
		}

		const emoji = line.match(/^ {2}emoji:\s*(.+)\s*$/);
		if (emoji) {
			current.emoji = parseScalar(emoji[1] ?? '');
			continue;
		}

		const label = line.match(/^ {2}label:\s*(.+)\s*$/);
		if (label) {
			current.label = parseScalar(label[1] ?? '');
			continue;
		}

		if (!inTypes) {
			continue;
		}

		const inlineType = line.match(/^ {4}-\s*(.+)\s*$/);
		if (inlineType) {
			const value = inlineType[1] ?? '';
			const keyMatch = value.match(/^key:\s*(.+)\s*$/);
			if (keyMatch) {
				currentType = { key: parseScalar(keyMatch[1] ?? ''), archived: false };
				current.types.push(currentType);
			} else {
				current.types.push({ key: parseScalar(value), archived: false });
				currentType = null;
			}
			continue;
		}

		const typeArchived = line.match(/^ {6}archived:\s*(.+)\s*$/);
		if (typeArchived && currentType) {
			currentType.archived = parseBoolean(typeArchived[1] ?? '');
		}
	}

	if (current) {
		trackers.push(current);
	}
	return trackers;
}

function parseScalar(value: string): string {
	return value.trim().replace(/^['"]|['"]$/g, '');
}

function parseBoolean(value: string): boolean {
	return parseScalar(value).toLowerCase() === 'true';
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
