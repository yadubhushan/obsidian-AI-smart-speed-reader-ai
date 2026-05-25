import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { createNodeDataAdapter } from './nodeDataAdapter';
import {
	emitStudyLoopSidecarOnClose,
	recordStudyLoopDictionaryLookup
} from '../src/study-loop/studyLoopBridge';
import {
	readStudyLoopSidecar,
	studyLoopSidecarPath,
	writeStudyLoopSidecar
} from '../src/study-loop/studyLoopSidecar';
import { studyLoopDocKey } from '../src/study-loop/docKey';
import { wrapDataAdapter } from '../src/store/vaultFileAdapter';
import type { PluginServices } from '../src/services/serviceRegistry';
import type { SpeedReaderAiSettings } from '../src/types';

function createMockApp(rootDir: string, notePath: string, markdown: string): App {
	const adapter = createNodeDataAdapter(rootDir);
	const configDir = join(rootDir, '.obsidian');
	const file: TFile = {
		path: notePath,
		extension: 'md'
	} as TFile;

	return {
		vault: {
			configDir,
			adapter,
			getAbstractFileByPath(path: string) {
				return path === notePath ? file : null;
			},
			async read(f: TFile) {
				if (f.path === notePath) {
					return markdown;
				}
				throw new Error('missing');
			}
		}
	} as App;
}

function createMockServices(progressPercent: number | null): PluginServices {
	return {
		readingStateStore: {
			get: () =>
				progressPercent == null
					? undefined
					: {
							progressPercent
						}
		}
	} as PluginServices;
}

const defaultSettings = (): SpeedReaderAiSettings =>
	({
		bookmarks: { noteBookmarkSectionHeading: 'Speed Reader Bookmarks' }
	}) as SpeedReaderAiSettings;

describe('studyLoopBridge', () => {
	let rootDir: string;
	const sourcePath = 'notes/study.md';
	const docKey = studyLoopDocKey(sourcePath);

	beforeEach(async () => {
		rootDir = await mkdtemp(join(tmpdir(), 'speed-reader-study-loop-'));
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	it('writes reading fields and handoff.closedAt when handoff active', async () => {
		const app = createMockApp(rootDir, sourcePath, '# Study\n');
		const adapter = wrapDataAdapter(app.vault.adapter);
		await writeStudyLoopSidecar(adapter, app.vault.configDir, sourcePath, {
			handoff: {
				active: true,
				source: 'plato',
				openedAt: '2026-05-24T13:00:00.000Z',
				closedAt: null
			}
		});

		recordStudyLoopDictionaryLookup(sourcePath, 'latency');

		await emitStudyLoopSidecarOnClose(
			{
				app,
				services: createMockServices(42),
				getSettings: defaultSettings
			},
			sourcePath
		);

		const sidecar = await readStudyLoopSidecar(adapter, app.vault.configDir, sourcePath);
		expect(sidecar.reading.progressPercent).toBe(42);
		expect(sidecar.reading.dictionaryLookups).toEqual(['latency']);
		expect(sidecar.handoff.active).toBe(true);
		expect(typeof sidecar.handoff.closedAt).toBe('string');
	});

	it('leaves handoff unchanged when not active', async () => {
		const app = createMockApp(rootDir, sourcePath, '# Study\n');
		const adapter = wrapDataAdapter(app.vault.adapter);
		await writeStudyLoopSidecar(adapter, app.vault.configDir, sourcePath, {
			handoff: {
				active: false,
				source: null,
				openedAt: null,
				closedAt: null
			},
			reading: { progressPercent: 10, bookmarkCount: 0 }
		});

		await emitStudyLoopSidecarOnClose(
			{
				app,
				services: createMockServices(55),
				getSettings: defaultSettings
			},
			sourcePath
		);

		const sidecar = await readStudyLoopSidecar(adapter, app.vault.configDir, sourcePath);
		expect(sidecar.reading.progressPercent).toBe(55);
		expect(sidecar.handoff.active).toBe(false);
		expect(sidecar.handoff.closedAt).toBeNull();

		const raw = JSON.parse(
			await app.vault.adapter.read(studyLoopSidecarPath(app.vault.configDir, docKey))
		);
		expect(raw.handoff.closedAt).toBeNull();
	});
});
