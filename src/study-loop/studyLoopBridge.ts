import type { App } from 'obsidian';
import type { PluginServices } from '../services/serviceRegistry';
import type { SpeedReaderAiSettings } from '../types';
import { wrapDataAdapter } from '../store/vaultFileAdapter';
import { readStudyLoopSidecar, writeStudyLoopSidecar } from './studyLoopSidecar';

/** Per-reader-session dictionary lookups (M4 F6). Cleared on reader-closed. */
const sessionDictionaryLookups = new Map<string, string[]>();

export function recordStudyLoopDictionaryLookup(sourcePath: string, word: string): void {
	const w = word.trim();
	if (!w) {
		return;
	}
	const list = sessionDictionaryLookups.get(sourcePath) ?? [];
	if (!list.includes(w) && list.length < 20) {
		list.push(w);
		sessionDictionaryLookups.set(sourcePath, list);
	}
}

function takeSessionDictionaryLookups(sourcePath: string): string[] {
	const list = sessionDictionaryLookups.get(sourcePath) ?? [];
	sessionDictionaryLookups.delete(sourcePath);
	return list;
}

function parseBookmarkHighlights(markdown: string, heading: string): string[] {
	const normalizedHeading = heading.trim();
	const h1Pattern = new RegExp(`^#\\s+${normalizedHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im');
	const match = h1Pattern.exec(markdown);
	if (!match) {
		return [];
	}
	const start = match.index + match[0].length;
	const rest = markdown.slice(start);
	const nextH1 = rest.search(/^#\s+/m);
	const section = nextH1 >= 0 ? rest.slice(0, nextH1) : rest;
	const re = /==\*\*\*(.+?)\*\*\*==/g;
	const out: string[] = [];
	const seen = new Set<string>();
	for (const m of section.matchAll(re)) {
		const text = (m[1] ?? '').trim();
		if (!text || seen.has(text)) {
			continue;
		}
		seen.add(text);
		out.push(text);
		if (out.length >= 20) {
			break;
		}
	}
	return out;
}

export interface StudyLoopBridgeDeps {
	app: App;
	services: PluginServices;
	getSettings: () => SpeedReaderAiSettings;
}

export function registerStudyLoopBridge(deps: StudyLoopBridgeDeps): void {
	deps.services.eventBus.on('reader-opened', ({ sourcePath }) => {
		sessionDictionaryLookups.set(sourcePath, []);
	});
	deps.services.eventBus.on('reader-closed', ({ sourcePath }) => {
		void emitStudyLoopSidecarOnClose(deps, sourcePath);
	});
}

/** Exported for Vitest (M4 F6). */
export async function emitStudyLoopSidecarOnClose(
	deps: StudyLoopBridgeDeps,
	sourcePath: string
): Promise<void> {
	if (!sourcePath.endsWith('.md')) {
		return;
	}

	const adapter = wrapDataAdapter(deps.app.vault.adapter);
	const configDir = deps.app.vault.configDir;
	const existing = await readStudyLoopSidecar(adapter, configDir, sourcePath);
	const state = deps.services.readingStateStore.get(sourcePath);

	let bookmarkCount = existing.reading.bookmarkCount;
	let weakPassages = existing.weakPassages;
	try {
		const file = deps.app.vault.getAbstractFileByPath(sourcePath);
		if (file && 'extension' in file) {
			const markdown = await deps.app.vault.read(file as import('obsidian').TFile);
			const heading = deps.getSettings().bookmarks.noteBookmarkSectionHeading;
			weakPassages = parseBookmarkHighlights(markdown, heading);
			bookmarkCount = weakPassages.length;
		}
	} catch {
		/* note read optional */
	}

	const closedAt = new Date().toISOString();
	const handoffActive = existing.handoff.active;
	const sessionLookups = takeSessionDictionaryLookups(sourcePath);
	const dictionaryLookups = [...existing.reading.dictionaryLookups];
	for (const w of sessionLookups) {
		if (!dictionaryLookups.includes(w)) {
			dictionaryLookups.push(w);
		}
	}

	await writeStudyLoopSidecar(adapter, configDir, sourcePath, {
		reading: {
			progressPercent: state?.progressPercent ?? existing.reading.progressPercent,
			wpmAverage: existing.reading.wpmAverage,
			bookmarkCount,
			dictionaryLookups: dictionaryLookups.slice(0, 20),
			rewindEvents: existing.reading.rewindEvents
		},
		weakPassages,
		handoff: handoffActive
			? {
					...existing.handoff,
					active: true,
					closedAt
				}
			: existing.handoff
	});
}
