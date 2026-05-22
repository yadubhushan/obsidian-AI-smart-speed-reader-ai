import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RSVPEngine } from '../src/engine/rsvpEngine';
import { ManifestStore } from '../src/store/ManifestStore';
import { docKeyFromSourcePath } from '../src/store/docKey';
import { StructuredReaderSession } from '../src/ui/structuredReaderSession';
import { DEFAULT_SETTINGS } from '../src/types';
import { createNodeDataAdapter } from './nodeDataAdapter';
import { createNodeManifestAdapter } from './testManifestAdapter';
import { sampleSectionsProcessed, TEST_CHECKSUM, TEST_SOURCE_PATH } from './prepareFixtures';

const NOTE_TEXT = `## Introduction

First paragraph for RSVP.

# Speed Reader Bookmarks

> bookmark only
`;

describe('StructuredReaderSession.reloadFromVaultText', () => {
	let rootDir: string;
	let store: ManifestStore;

	beforeEach(async () => {
		rootDir = await mkdtemp(join(tmpdir(), 'speed-reader-reload-'));
		const vaultAdapter = createNodeDataAdapter(rootDir);
		store = new ManifestStore(createNodeManifestAdapter(rootDir), rootDir, {
			vaultAdapter,
			basePath: rootDir
		});
	});

	afterEach(async () => {
		await rm(rootDir, { recursive: true, force: true });
	});

	it('loads AI playback when cache is ready after vault reload', async () => {
		const docKey = docKeyFromSourcePath(TEST_SOURCE_PATH);
		await store.saveProcessedDocument(docKey, sampleSectionsProcessed());

		const loadProcessedDocument = vi.fn();
		const loadDeterministic = vi.fn();
		const engine = {
			loadProcessedDocument,
			loadDeterministic,
			goToSection: vi.fn(),
			seekToToken: vi.fn()
		} as unknown as RSVPEngine;

		const session = new StructuredReaderSession(
			store,
			TEST_SOURCE_PATH,
			NOTE_TEXT,
			TEST_CHECKSUM,
			0,
			DEFAULT_SETTINGS
		);
		await session.initialize();

		const kind = await session.reloadFromVaultText(
			`${NOTE_TEXT}\n\nMore bookmark text`,
			TEST_CHECKSUM,
			engine,
			{ sectionIndex: 0, tokenIndex: 2 }
		);

		expect(kind).toBe('ai');
		expect(loadProcessedDocument).toHaveBeenCalled();
		expect(loadDeterministic).not.toHaveBeenCalled();
		expect(session.modeStatus()).toBe('ready');
	});
});
