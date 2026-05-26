import type { ReadingState, ReadingStateFile } from '../types/m2Contracts';

export interface ReadingStateMergeResult {
	merged: ReadingStateFile;
	localHadNewer: boolean;
}

function parseTimestamp(value: string | undefined): number {
	if (!value) {
		return 0;
	}
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function isLocalStateNewer(local: ReadingState, disk: ReadingState): boolean {
	return parseTimestamp(local.lastOpenedAt) >= parseTimestamp(disk.lastOpenedAt);
}

function pickLastGlobalSourcePath(sources: Record<string, ReadingState>): string {
	let bestPath = '';
	let bestTime = 0;

	for (const [sourcePath, state] of Object.entries(sources)) {
		const openedAt = parseTimestamp(state.lastOpenedAt);
		if (openedAt >= bestTime) {
			bestTime = openedAt;
			bestPath = sourcePath;
		}
	}

	return bestPath;
}

/** Merge local and disk reading state; per-source `lastOpenedAt` wins. */
export function mergeReadingStateFiles(
	local: ReadingStateFile,
	disk: ReadingStateFile
): ReadingStateMergeResult {
	const mergedSources: Record<string, ReadingState> = { ...disk.sources };
	let localHadNewer = false;

	for (const [sourcePath, localState] of Object.entries(local.sources)) {
		const diskState = disk.sources[sourcePath];
		if (!diskState) {
			mergedSources[sourcePath] = localState;
			localHadNewer = true;
			continue;
		}

		if (isLocalStateNewer(localState, diskState)) {
			mergedSources[sourcePath] = localState;
			localHadNewer = true;
		}
	}

	return {
		merged: {
			lastGlobalSourcePath: pickLastGlobalSourcePath(mergedSources),
			sources: mergedSources
		},
		localHadNewer
	};
}

export function readingStateFilesEqual(a: ReadingStateFile, b: ReadingStateFile): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
