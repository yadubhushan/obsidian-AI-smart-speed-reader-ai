import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatVersionLabel } from '../src/ui/versionPicker';
import { ManifestStore } from '../src/store/ManifestStore';
import { docKeyFromSourcePath } from '../src/store/docKey';
import { createNodeDataAdapter } from './nodeDataAdapter';
import { createNodeManifestAdapter } from './testManifestAdapter';
import {
	sampleSectionsProcessed,
	sampleStoryProcessed,
	TEST_CHECKSUM,
	TEST_SOURCE_PATH
} from './prepareFixtures';

describe('AI prepare version history', () => {
	let rootDir: string;
	let store: ManifestStore;

	beforeEach(async () => {
		rootDir = await mkdtemp(join(tmpdir(), 'speed-reader-versions-'));
		const vaultAdapter = createNodeDataAdapter(rootDir);
		store = new ManifestStore(createNodeManifestAdapter(rootDir), rootDir, {
			vaultAdapter,
			basePath: rootDir
		});
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	it('creates monotonic v1 v2 v3 on successive prepares', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleSectionsProcessed());
		const story = sampleStoryProcessed();
		await store.saveProcessedDocument(docKey, story);
		const sections2 = sampleSectionsProcessed();
		sections2.sections[0]!.stream = [{ kind: 'word', text: 'Again' }];
		await store.saveProcessedDocument(docKey, sections2);

		const index = await store.getDocumentIndex(TEST_SOURCE_PATH);
		expect(index?.versions.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
		expect(index?.activeVersionId).toBe('v3');
		expect(index?.versions[2]?.modeId).toBe('sections');
	});

	it('lists versions newest-first and loads a specific version', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleSectionsProcessed());
		await store.saveProcessedDocument(docKey, sampleStoryProcessed());

		const index = await store.getDocumentIndex(TEST_SOURCE_PATH);
		const listed = store.listVersions(index!);
		expect(listed.map((v) => v.id)).toEqual(['v2', 'v1']);

		const v1 = await store.loadVersion(docKey, 'v1');
		expect(v1?.kind).toBe('sections');
		const v2 = await store.loadVersion(docKey, 'v2');
		expect(v2?.kind).toBe('single_story');
	});

	it('prunes oldest versions beyond maxPrepareVersions', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		for (let i = 0; i < 12; i++) {
			const doc = sampleSectionsProcessed();
			doc.meta.processedAt = `2026-05-01T00:00:${String(i).padStart(2, '0')}.000Z`;
			await store.saveProcessedDocument(docKey, doc, 5);
		}
		const index = await store.getDocumentIndex(TEST_SOURCE_PATH);
		expect(index?.versions.length).toBe(5);
		expect(index?.versions[0]?.id).toBe('v8');
		expect(index?.activeVersionId).toBe('v12');
	});

	it('marks all versions stale on checksum mismatch and reconciles by readable checksum', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleSectionsProcessed());
		const stale = await store.markStaleIfChecksumMismatch(TEST_SOURCE_PATH, 'other');
		expect(stale?.versions[0]?.status).toBe('stale');
		const reconciled = await store.reconcileStaleModes(TEST_SOURCE_PATH, TEST_CHECKSUM);
		expect(reconciled?.versions[0]?.status).toBe('ready');
	});

	it('formatVersionLabel includes mode name and stale suffix', () => {
		expect(
			formatVersionLabel({
				id: 'v3',
				number: 3,
				modeId: 'sections',
				preparedAt: '2026-05-01',
				model: 'gpt',
				sourceChecksum: 'x',
				status: 'ready'
			})
		).toBe('V3 — Sections');
		expect(
			formatVersionLabel({
				id: 'v2',
				number: 2,
				modeId: 'single_story',
				preparedAt: '2026-05-01',
				model: 'gpt',
				sourceChecksum: 'x',
				status: 'stale'
			})
		).toBe('V2 — Single story (stale)');
	});
});
