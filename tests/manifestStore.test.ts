import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
import { processDocument } from '../src/prepare/processDocument';
import {
	defaultProcessorDeps,
	mockLlmClient,
	overviewBundle,
	sectionsLlmResponse,
	storyLlmResponse
} from './prepareFixtures';

describe('ManifestStore', () => {
	let rootDir: string;
	let store: ManifestStore;

	beforeEach(async () => {
		rootDir = await mkdtemp(join(tmpdir(), 'speed-reader-cache-'));
		const vaultAdapter = createNodeDataAdapter(rootDir);
		store = new ManifestStore(createNodeManifestAdapter(rootDir), rootDir, {
			vaultAdapter,
			basePath: rootDir
		});
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	it('round-trips sections ProcessedDocument', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		const processed = sampleSectionsProcessed();
		await store.saveProcessedDocument(docKey, processed);
		const loaded = await store.loadProcessedDocument(docKey, 'sections');
		expect(loaded).toEqual(processed);
	});

	it('round-trips single_story ProcessedDocument', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		const processed = sampleStoryProcessed();
		await store.saveProcessedDocument(docKey, processed);
		const loaded = await store.loadProcessedDocument(docKey, 'single_story');
		expect(loaded).toEqual(processed);
	});

	it('writes expected disk layout for versioned sections', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleSectionsProcessed());
		const adapter = createNodeManifestAdapter(rootDir);
		expect(await adapter.exists(join(docKey, 'index.json'))).toBe(true);
		expect(await adapter.exists(join(docKey, 'versions/v1/payload/index.json'))).toBe(true);
		expect(
			await adapter.exists(
				join(docKey, 'versions/v1/payload/sections/01-aws-vs-gcp.json')
			)
		).toBe(true);
	});

	it('writes single_story under version payload', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleStoryProcessed());
		const adapter = createNodeManifestAdapter(rootDir);
		expect(
			await adapter.exists(join(docKey, 'versions/v1/payload/manifest.json'))
		).toBe(true);
	});

	it('dual cache: both modes coexist as separate versions', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleSectionsProcessed());
		await store.saveProcessedDocument(docKey, sampleStoryProcessed());
		const sections = await store.loadProcessedDocument(docKey, 'sections');
		const story = await store.loadProcessedDocument(docKey, 'single_story');
		expect(sections?.kind).toBe('sections');
		expect(story?.kind).toBe('single_story');
		const index = await store.getDocumentIndex(TEST_SOURCE_PATH);
		expect(index?.versions).toHaveLength(2);
		expect(index?.versions.every((v) => v.status === 'ready')).toBe(true);
	});

	it('re-prepare sections leaves single_story cache intact', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleStoryProcessed());
		const updatedSections = sampleSectionsProcessed();
		updatedSections.sections[0]!.stream = [{ kind: 'word', text: 'Updated' }];
		await store.saveProcessedDocument(docKey, updatedSections);
		const story = await store.loadProcessedDocument(docKey, 'single_story');
		expect(story?.stream).toEqual([{ kind: 'word', text: 'One' }, { kind: 'word', text: 'story.' }]);
	});

	it('markStaleIfChecksumMismatch marks ready versions stale', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleSectionsProcessed());
		await store.saveProcessedDocument(docKey, sampleStoryProcessed());
		const index = await store.markStaleIfChecksumMismatch(
			TEST_SOURCE_PATH,
			'new-checksum'
		);
		expect(index?.versions.every((v) => v.status === 'stale')).toBe(true);
		expect(index?.sourceChecksum).toBe('new-checksum');
	});

	it('reconcileStaleModes restores ready when version checksum matches readable body', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleSectionsProcessed());
		await store.markStaleIfChecksumMismatch(TEST_SOURCE_PATH, 'wrong-full-file-hash');
		const reconciled = await store.reconcileStaleModes(TEST_SOURCE_PATH, TEST_CHECKSUM);
		expect(reconciled?.versions[0]?.status).toBe('ready');
		expect(reconciled?.sourceChecksum).toBe(TEST_CHECKSUM);
	});

	it('setActiveMode updates root index', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleSectionsProcessed());
		await store.setActiveMode(TEST_SOURCE_PATH, 'single_story');
		const index = await store.getDocumentIndex(TEST_SOURCE_PATH);
		expect(index?.activeProcessingMode).toBe('single_story');
	});

	it('integration: mock prepare both processors with zero reload LLM calls', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		const bundle = overviewBundle();
		let llmCalls = 0;
		const llm = mockLlmClient([sectionsLlmResponse(), storyLlmResponse()]);
		const trackLlm = {
			complete: async (s: string, u: string) => {
				llmCalls++;
				return llm.complete(s, u);
			}
		};
		const deps = defaultProcessorDeps(trackLlm);
		const sectionsDoc = await processDocument('sections', bundle, deps);
		await store.saveProcessedDocument(docKey, sectionsDoc);
		const storyDoc = await processDocument('single_story', bundle, deps);
		await store.saveProcessedDocument(docKey, storyDoc);
		expect(llmCalls).toBe(2);
		const callsBeforeLoad = llmCalls;
		const loadedSections = await store.loadProcessedDocument(docKey, 'sections');
		const loadedStory = await store.loadProcessedDocument(docKey, 'single_story');
		expect(loadedSections?.kind).toBe('sections');
		expect(loadedStory?.kind).toBe('single_story');
		expect(llmCalls).toBe(callsBeforeLoad);
	});

	it('getDocumentIndex returns null when missing', async () => {
		expect(await store.getDocumentIndex(TEST_SOURCE_PATH)).toBeNull();
	});

	it('index records source checksum after save', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleSectionsProcessed());
		const index = await store.getDocumentIndex(TEST_SOURCE_PATH);
		expect(index?.sourceChecksum).toBe(TEST_CHECKSUM);
	});

	it('deleteDocumentCache removes doc folder and index', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleSectionsProcessed());
		expect(await store.getDocumentIndex(TEST_SOURCE_PATH)).not.toBeNull();

		const removed = await store.deleteDocumentCache(TEST_SOURCE_PATH);
		expect(removed).toBe(true);
		expect(await store.getDocumentIndex(TEST_SOURCE_PATH)).toBeNull();

		const again = await store.deleteDocumentCache(TEST_SOURCE_PATH);
		expect(again).toBe(false);
	});

	it('clearAllDocumentCache removes all doc folders', async () => {
		const otherPath = 'notes/other.md';
		const docKeyA = docKeyFromSourcePath(TEST_SOURCE_PATH);
		const docKeyB = docKeyFromSourcePath(otherPath);
		await store.saveProcessedDocument(docKeyA, sampleSectionsProcessed());
		const otherDoc = sampleStoryProcessed();
		otherDoc.meta.sourcePath = otherPath;
		await store.saveProcessedDocument(docKeyB, otherDoc);

		const count = await store.clearAllDocumentCache();
		expect(count).toBe(2);
		expect(await store.getDocumentIndex(TEST_SOURCE_PATH)).toBeNull();
		expect(await store.getDocumentIndex(otherPath)).toBeNull();
	});
});
