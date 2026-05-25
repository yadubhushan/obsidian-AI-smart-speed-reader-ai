import { atomicWriteText, type VaultFileAdapter } from '../store/vaultFileAdapter';
import { studyLoopDocKey } from './docKey';

export const STUDY_LOOP_SIDECAR_VERSION = 1;

export interface StudyLoopHandoff {
	active: boolean;
	source: 'plato' | 'standalone' | null;
	platoLeafId?: string;
	openedAt: string | null;
	closedAt: string | null;
}

export interface StudyLoopReading {
	progressPercent: number | null;
	wpmAverage: number | null;
	bookmarkCount: number;
	dictionaryLookups: string[];
	rewindEvents: Array<{ sectionId: string; wordIndex: number }>;
}

export interface StudyLoopSidecar {
	version: typeof STUDY_LOOP_SIDECAR_VERSION;
	sourcePath: string;
	sourceChecksum: string | null;
	updatedAt: string;
	handoff: StudyLoopHandoff;
	reading: StudyLoopReading;
	weakPassages: string[];
}

export function studyLoopSidecarPath(configDir: string, docKey: string): string {
	const base = configDir.replace(/\\/g, '/').replace(/\/+$/, '');
	return `${base}/study-loop/${docKey}.json`;
}

export function defaultStudyLoopSidecar(sourcePath: string): StudyLoopSidecar {
	return {
		version: STUDY_LOOP_SIDECAR_VERSION,
		sourcePath,
		sourceChecksum: null,
		updatedAt: new Date().toISOString(),
		handoff: {
			active: false,
			source: null,
			openedAt: null,
			closedAt: null
		},
		reading: {
			progressPercent: null,
			wpmAverage: null,
			bookmarkCount: 0,
			dictionaryLookups: [],
			rewindEvents: []
		},
		weakPassages: []
	};
}

function sidecarFromDict(raw: unknown, sourcePath: string): StudyLoopSidecar {
	if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
		return defaultStudyLoopSidecar(sourcePath);
	}
	const o = raw as Record<string, unknown>;
	if (o.version !== STUDY_LOOP_SIDECAR_VERSION || typeof o.sourcePath !== 'string') {
		return defaultStudyLoopSidecar(sourcePath);
	}
	const handoffRaw = o.handoff;
	const readingRaw = o.reading;
	const handoff =
		handoffRaw != null && typeof handoffRaw === 'object' && !Array.isArray(handoffRaw)
			? (handoffRaw as Record<string, unknown>)
			: {};
	const reading =
		readingRaw != null && typeof readingRaw === 'object' && !Array.isArray(readingRaw)
			? (readingRaw as Record<string, unknown>)
			: {};
	return {
		version: STUDY_LOOP_SIDECAR_VERSION,
		sourcePath: o.sourcePath,
		sourceChecksum: typeof o.sourceChecksum === 'string' ? o.sourceChecksum : null,
		updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
		handoff: {
			active: Boolean(handoff.active),
			source:
				handoff.source === 'plato' || handoff.source === 'standalone'
					? handoff.source
					: null,
			openedAt: typeof handoff.openedAt === 'string' ? handoff.openedAt : null,
			closedAt: typeof handoff.closedAt === 'string' ? handoff.closedAt : null,
			...(typeof handoff.platoLeafId === 'string'
				? { platoLeafId: handoff.platoLeafId }
				: {})
		},
		reading: {
			progressPercent:
				typeof reading.progressPercent === 'number' ? reading.progressPercent : null,
			wpmAverage: typeof reading.wpmAverage === 'number' ? reading.wpmAverage : null,
			bookmarkCount: typeof reading.bookmarkCount === 'number' ? reading.bookmarkCount : 0,
			dictionaryLookups: Array.isArray(reading.dictionaryLookups)
				? reading.dictionaryLookups.filter((x): x is string => typeof x === 'string')
				: [],
			rewindEvents: []
		},
		weakPassages: Array.isArray(o.weakPassages)
			? o.weakPassages.filter((x): x is string => typeof x === 'string')
			: []
	};
}

export async function readStudyLoopSidecar(
	adapter: VaultFileAdapter,
	configDir: string,
	sourcePath: string
): Promise<StudyLoopSidecar> {
	const docKey = studyLoopDocKey(sourcePath);
	const path = studyLoopSidecarPath(configDir, docKey);
	try {
		if (!(await adapter.exists(path))) {
			return defaultStudyLoopSidecar(sourcePath);
		}
		const text = await adapter.read(path);
		return sidecarFromDict(JSON.parse(text) as unknown, sourcePath);
	} catch {
		return defaultStudyLoopSidecar(sourcePath);
	}
}

export async function writeStudyLoopSidecar(
	adapter: VaultFileAdapter,
	configDir: string,
	sourcePath: string,
	patch: Partial<StudyLoopSidecar>
): Promise<StudyLoopSidecar> {
	const docKey = studyLoopDocKey(sourcePath);
	const existing = await readStudyLoopSidecar(adapter, configDir, sourcePath);
	const merged: StudyLoopSidecar = {
		...existing,
		...patch,
		version: STUDY_LOOP_SIDECAR_VERSION,
		updatedAt: new Date().toISOString(),
		handoff: { ...existing.handoff, ...(patch.handoff ?? {}) },
		reading: { ...existing.reading, ...(patch.reading ?? {}) },
		weakPassages: patch.weakPassages ?? existing.weakPassages
	};
	const path = studyLoopSidecarPath(configDir, docKey);
	await atomicWriteText(adapter, path, `${JSON.stringify(merged, null, 2)}\n`);
	return merged;
}
