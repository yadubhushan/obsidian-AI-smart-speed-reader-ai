import type { DataAdapter } from 'obsidian';
import type {
	DocumentCacheIndex,
	DocumentCacheIndexV1,
	ModeCacheEntry,
	PrepareVersionEntry,
	ProcessedDocument,
	ProcessingModeId,
	SectionsModeIndex,
	SingleStoryManifest,
	SpeedReadSectionManifest
} from '../types/processedDocument';
import { docKeyFromSourcePath } from './docKey';
import {
	listReadCacheDocKeys,
	readCacheDocKeyExists,
	removeReadCacheTree
} from './readCachePaths';
import {
	parseDocumentCacheIndex,
	parseDocumentCacheIndexV1,
	parseDocumentCacheIndexV2,
	parseSectionsModeIndex,
	parseSingleStoryManifest,
	parseSpeedReadSectionManifest
} from '../prepare/validateProcessedDocument';
import {
	latestVersion,
	sortVersionsNewestFirst,
	versionIdFromNumber
} from './cacheIndexUtils';

export interface ManifestStoreAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	mkdir(path: string): Promise<void>;
	remove(path: string): Promise<void>;
	list(path: string): Promise<string[]>;
}

function joinPath(base: string, ...parts: string[]): string {
	const sep = base.includes('\\') ? '\\' : '/';
	const normalized = [base, ...parts]
		.map((p) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
		.filter(Boolean)
		.join('/');
	return normalized.replace(/\/+/g, '/');
}

function defaultDocumentIndex(sourcePath: string, sourceChecksum: string): DocumentCacheIndex {
	const now = new Date().toISOString();
	return {
		version: 2,
		sourcePath,
		sourceChecksum,
		activeProcessingMode: 'sections',
		activeVersionId: null,
		nextVersionNumber: 1,
		versions: [],
		updatedAt: now
	};
}

export interface ManifestStoreCacheDelete {
	vaultAdapter: DataAdapter;
	basePath: string;
}

export class ManifestStore {
	constructor(
		private readonly adapter: ManifestStoreAdapter,
		private readonly _basePath: string,
		private readonly cacheDelete?: ManifestStoreCacheDelete
	) {}

	docKeyFromSourcePath(sourcePath: string): string {
		return docKeyFromSourcePath(sourcePath);
	}

	private docRoot(docKey: string): string {
		return docKey;
	}

	private rootIndexPath(docKey: string): string {
		return joinPath(this.docRoot(docKey), 'index.json');
	}

	private versionsRoot(docKey: string): string {
		return joinPath(this.docRoot(docKey), 'versions');
	}

	private versionRoot(docKey: string, versionId: string): string {
		return joinPath(this.versionsRoot(docKey), versionId);
	}

	private versionPayloadRoot(docKey: string, versionId: string): string {
		return joinPath(this.versionRoot(docKey, versionId), 'payload');
	}

	/** Legacy v1 paths (migration only). */
	private legacySectionsModeRoot(docKey: string): string {
		return joinPath(this.docRoot(docKey), 'modes', 'sections');
	}

	private legacySingleStoryManifestPath(docKey: string): string {
		return joinPath(this.docRoot(docKey), 'modes', 'single_story', 'manifest.json');
	}

	async getDocumentIndex(sourcePath: string): Promise<DocumentCacheIndex | null> {
		const docKey = docKeyFromSourcePath(sourcePath);
		const path = this.rootIndexPath(docKey);
		if (!(await this.adapter.exists(path))) {
			return this.migrateLegacyLayoutWithoutIndex(docKey, sourcePath);
		}
		try {
			const text = await this.adapter.read(path);
			const parsed: unknown = JSON.parse(text);
			let index = parseDocumentCacheIndexV2(parsed);
			if (!index) {
				const v1 = parseDocumentCacheIndexV1(parsed);
				if (v1 && v1.sourcePath === sourcePath) {
					index = await this.migrateFromV1(docKey, v1);
				}
			}
			if (!index || index.sourcePath !== sourcePath) {
				return null;
			}
			if (index.versions.length === 0) {
				const migrated = await this.migrateLegacyLayoutWithoutIndex(docKey, sourcePath);
				if (migrated) {
					return migrated;
				}
			}
			return index;
		} catch {
			return null;
		}
	}

	listVersions(index: DocumentCacheIndex): PrepareVersionEntry[] {
		return sortVersionsNewestFirst(index.versions);
	}

	async setActiveVersion(sourcePath: string, versionId: string): Promise<void> {
		const docKey = docKeyFromSourcePath(sourcePath);
		const index = await this.getDocumentIndex(sourcePath);
		if (!index) {
			return;
		}
		const entry = index.versions.find((v) => v.id === versionId);
		if (!entry) {
			return;
		}
		index.activeVersionId = versionId;
		index.activeProcessingMode = entry.modeId;
		index.updatedAt = new Date().toISOString();
		await this.writeJson(this.rootIndexPath(docKey), index);
	}

	async setActiveMode(sourcePath: string, modeId: ProcessingModeId): Promise<void> {
		const docKey = docKeyFromSourcePath(sourcePath);
		let index = await this.getDocumentIndex(sourcePath);
		if (!index) {
			index = defaultDocumentIndex(sourcePath, '');
		}
		index.activeProcessingMode = modeId;
		index.updatedAt = new Date().toISOString();
		await this.writeJson(this.rootIndexPath(docKey), index);
	}

	async markStaleIfChecksumMismatch(
		sourcePath: string,
		checksum: string
	): Promise<DocumentCacheIndex | null> {
		const docKey = docKeyFromSourcePath(sourcePath);
		let index = await this.getDocumentIndex(sourcePath);
		if (!index) {
			return null;
		}
		if (index.sourceChecksum === checksum) {
			return index;
		}
		index.sourceChecksum = checksum;
		index.updatedAt = new Date().toISOString();
		let changed = false;
		for (const entry of index.versions) {
			if (entry.status === 'ready') {
				entry.status = 'stale';
				changed = true;
			}
		}
		if (changed) {
			await this.writeJson(this.rootIndexPath(docKey), index);
		}
		return index;
	}

	async reconcileStaleModes(
		sourcePath: string,
		readableChecksum: string
	): Promise<DocumentCacheIndex | null> {
		const docKey = docKeyFromSourcePath(sourcePath);
		const index = await this.getDocumentIndex(sourcePath);
		if (!index) {
			return null;
		}

		let changed = false;
		for (const entry of index.versions) {
			if (entry.status === 'stale' && entry.sourceChecksum === readableChecksum) {
				entry.status = 'ready';
				changed = true;
			}
		}
		if (!changed) {
			return index;
		}

		index.sourceChecksum = readableChecksum;
		index.updatedAt = new Date().toISOString();
		await this.writeJson(this.rootIndexPath(docKey), index);
		return index;
	}

	async saveProcessedDocument(
		docKey: string,
		processed: ProcessedDocument,
		maxVersions = 10
	): Promise<PrepareVersionEntry> {
		return this.saveNewVersion(docKey, processed, maxVersions);
	}

	async saveNewVersion(
		docKey: string,
		processed: ProcessedDocument,
		maxVersions: number
	): Promise<PrepareVersionEntry> {
		const sourcePath = processed.meta.sourcePath;
		let index = await this.getDocumentIndex(sourcePath);
		if (!index) {
			index = defaultDocumentIndex(sourcePath, processed.meta.sourceChecksum);
		}

		const versionNumber = index.nextVersionNumber;
		const versionId = versionIdFromNumber(versionNumber);
		const payloadRoot = this.versionPayloadRoot(docKey, versionId);

		if (processed.kind === 'sections') {
			await this.writeSectionsPayload(payloadRoot, processed);
		} else {
			await this.writeSingleStoryPayload(payloadRoot, processed);
		}

		const entry: PrepareVersionEntry = {
			id: versionId,
			number: versionNumber,
			modeId: processed.processorId,
			preparedAt: processed.meta.processedAt,
			model: processed.meta.model,
			sourceChecksum: processed.meta.sourceChecksum,
			status: 'ready'
		};

		index.versions.push(entry);
		index.nextVersionNumber = versionNumber + 1;
		index.activeVersionId = versionId;
		index.activeProcessingMode = processed.processorId;
		index.sourceChecksum = processed.meta.sourceChecksum;
		index.updatedAt = new Date().toISOString();

		await this.writeJson(this.rootIndexPath(docKey), index);
		await this.pruneVersions(docKey, index, maxVersions);
		return entry;
	}

	private async pruneVersions(
		docKey: string,
		index: DocumentCacheIndex,
		maxVersions: number
	): Promise<void> {
		if (index.versions.length <= maxVersions) {
			return;
		}
		const sorted = [...index.versions].sort((a, b) => a.number - b.number);
		const toRemove = sorted.slice(0, index.versions.length - maxVersions);
		const removeIds = new Set(toRemove.map((v) => v.id));

		if (index.activeVersionId && removeIds.has(index.activeVersionId)) {
			const latest = latestVersion(index);
			index.activeVersionId = latest?.id ?? null;
			if (latest) {
				index.activeProcessingMode = latest.modeId;
			}
		}

		index.versions = index.versions.filter((v) => !removeIds.has(v.id));
		index.updatedAt = new Date().toISOString();
		await this.writeJson(this.rootIndexPath(docKey), index);

		for (const id of removeIds) {
			await this.adapter.remove(this.versionRoot(docKey, id));
		}
	}

	async loadProcessedDocument(
		docKey: string,
		modeId: ProcessingModeId,
		versionId?: string | null
	): Promise<ProcessedDocument | null> {
		if (versionId) {
			return this.loadVersion(docKey, versionId);
		}
		const index = await this.getDocumentIndexByDocKey(docKey);
		if (!index) {
			return this.loadLegacyProcessedDocument(docKey, modeId);
		}
		const forMode = sortVersionsNewestFirst(index.versions).find((v) => v.modeId === modeId);
		if (forMode) {
			return this.loadVersion(docKey, forMode.id);
		}
		if (index.activeVersionId) {
			return this.loadVersion(docKey, index.activeVersionId);
		}
		return this.loadLegacyProcessedDocument(docKey, modeId);
	}

	async loadVersion(docKey: string, versionId: string): Promise<ProcessedDocument | null> {
		const index = await this.getDocumentIndexByDocKey(docKey);
		const entry = index?.versions.find((v) => v.id === versionId);
		if (!entry) {
			return null;
		}
		const payloadRoot = this.versionPayloadRoot(docKey, versionId);
		if (entry.modeId === 'sections') {
			return this.loadSectionsPayload(payloadRoot);
		}
		return this.loadSingleStoryPayload(payloadRoot);
	}

	private async getDocumentIndexByDocKey(docKey: string): Promise<DocumentCacheIndex | null> {
		const path = this.rootIndexPath(docKey);
		if (!(await this.adapter.exists(path))) {
			return null;
		}
		try {
			const text = await this.adapter.read(path);
			return parseDocumentCacheIndex(JSON.parse(text));
		} catch {
			return null;
		}
	}

	private async writeSectionsPayload(
		payloadRoot: string,
		processed: Extract<ProcessedDocument, { kind: 'sections' }>
	): Promise<void> {
		const sectionsDir = joinPath(payloadRoot, 'sections');
		await this.adapter.mkdir(sectionsDir);

		const modeIndex: SectionsModeIndex = {
			version: 1,
			sourcePath: processed.meta.sourcePath,
			sourceChecksum: processed.meta.sourceChecksum,
			preparedAt: processed.meta.processedAt,
			prepareStrategy: processed.meta.prepareStrategy,
			model: processed.meta.model,
			sections: processed.sections.map((s, i) => ({
				id: s.sectionId,
				title: s.title,
				order: i,
				status: 'ready' as const
			}))
		};
		await this.writeJson(joinPath(payloadRoot, 'index.json'), modeIndex);

		for (const section of processed.sections) {
			const manifest: SpeedReadSectionManifest = {
				version: 1,
				sectionId: section.sectionId,
				sourcePath: processed.meta.sourcePath,
				sourceChecksum: processed.meta.sourceChecksum,
				title: section.title,
				preparedAt: processed.meta.processedAt,
				model: processed.meta.model,
				stream: section.stream
			};
			await this.writeJson(joinPath(sectionsDir, `${section.sectionId}.json`), manifest);
		}
	}

	private async writeSingleStoryPayload(
		payloadRoot: string,
		processed: Extract<ProcessedDocument, { kind: 'single_story' }>
	): Promise<void> {
		await this.adapter.mkdir(payloadRoot);
		const manifest: SingleStoryManifest = {
			version: 1,
			sourcePath: processed.meta.sourcePath,
			sourceChecksum: processed.meta.sourceChecksum,
			preparedAt: processed.meta.processedAt,
			prepareStrategy: processed.meta.prepareStrategy,
			model: processed.meta.model,
			stream: processed.stream
		};
		await this.writeJson(joinPath(payloadRoot, 'manifest.json'), manifest);
	}

	private async loadSectionsPayload(payloadRoot: string): Promise<ProcessedDocument | null> {
		const indexPath = joinPath(payloadRoot, 'index.json');
		if (!(await this.adapter.exists(indexPath))) {
			return null;
		}
		try {
			const indexText = await this.adapter.read(indexPath);
			const modeIndex = parseSectionsModeIndex(JSON.parse(indexText));
			if (!modeIndex) {
				return null;
			}
			const sectionsDir = joinPath(payloadRoot, 'sections');
			const sections = [];
			const sorted = [...modeIndex.sections].sort((a, b) => a.order - b.order);
			for (const entry of sorted) {
				const sectionPath = joinPath(sectionsDir, `${entry.id}.json`);
				if (!(await this.adapter.exists(sectionPath))) {
					return null;
				}
				const sectionText = await this.adapter.read(sectionPath);
				const manifest = parseSpeedReadSectionManifest(JSON.parse(sectionText));
				if (!manifest) {
					return null;
				}
				sections.push({
					sectionId: manifest.sectionId,
					title: manifest.title,
					stream: manifest.stream
				});
			}
			if (sections.length === 0) {
				return null;
			}
			return {
				kind: 'sections',
				processorId: 'sections',
				meta: {
					sourcePath: modeIndex.sourcePath,
					sourceChecksum: modeIndex.sourceChecksum,
					processedAt: modeIndex.preparedAt,
					model: modeIndex.model,
					prepareStrategy: modeIndex.prepareStrategy
				},
				sections
			};
		} catch {
			return null;
		}
	}

	private async loadSingleStoryPayload(payloadRoot: string): Promise<ProcessedDocument | null> {
		const manifestPath = joinPath(payloadRoot, 'manifest.json');
		if (!(await this.adapter.exists(manifestPath))) {
			return null;
		}
		try {
			const text = await this.adapter.read(manifestPath);
			const manifest = parseSingleStoryManifest(JSON.parse(text));
			if (!manifest) {
				return null;
			}
			return {
				kind: 'single_story',
				processorId: 'single_story',
				meta: {
					sourcePath: manifest.sourcePath,
					sourceChecksum: manifest.sourceChecksum,
					processedAt: manifest.preparedAt,
					model: manifest.model,
					prepareStrategy: manifest.prepareStrategy
				},
				stream: manifest.stream
			};
		} catch {
			return null;
		}
	}

	private async loadLegacyProcessedDocument(
		docKey: string,
		modeId: ProcessingModeId
	): Promise<ProcessedDocument | null> {
		if (modeId === 'sections') {
			return this.loadLegacySections(docKey);
		}
		return this.loadLegacySingleStory(docKey);
	}

	private async loadLegacySections(docKey: string): Promise<ProcessedDocument | null> {
		return this.loadSectionsPayload(this.legacySectionsModeRoot(docKey));
	}

	private async loadLegacySingleStory(docKey: string): Promise<ProcessedDocument | null> {
		const manifestPath = this.legacySingleStoryManifestPath(docKey);
		if (!(await this.adapter.exists(manifestPath))) {
			return null;
		}
		return this.loadSingleStoryPayload(joinPath(this.docRoot(docKey), 'modes', 'single_story'));
	}

	private async migrateFromV1(
		docKey: string,
		v1: DocumentCacheIndexV1
	): Promise<DocumentCacheIndex> {
		const index = defaultDocumentIndex(v1.sourcePath, v1.sourceChecksum);
		index.activeProcessingMode = v1.activeProcessingMode;
		index.updatedAt = new Date().toISOString();

		const modeOrder: ProcessingModeId[] = ['sections', 'single_story'];
		for (const modeId of modeOrder) {
			const entry = v1.modes[modeId];
			if (entry.status !== 'ready' || !entry.preparedAt || !entry.model || !entry.sourceChecksum) {
				continue;
			}
			const versionNumber = index.nextVersionNumber;
			const versionId = versionIdFromNumber(versionNumber);
			const payloadRoot = this.versionPayloadRoot(docKey, versionId);
			const legacyDoc = await this.loadLegacyProcessedDocument(docKey, modeId);
			if (!legacyDoc) {
				continue;
			}
			if (legacyDoc.kind === 'sections') {
				await this.writeSectionsPayload(payloadRoot, legacyDoc);
			} else {
				await this.writeSingleStoryPayload(payloadRoot, legacyDoc);
			}
			index.versions.push({
				id: versionId,
				number: versionNumber,
				modeId,
				preparedAt: entry.preparedAt,
				model: entry.model,
				sourceChecksum: entry.sourceChecksum,
				status: entry.status === 'ready' ? 'ready' : 'stale'
			});
			index.nextVersionNumber = versionNumber + 1;
		}

		const latest = latestVersion(index);
		index.activeVersionId = latest?.id ?? null;
		if (latest) {
			index.activeProcessingMode = latest.modeId;
		}

		await this.writeJson(this.rootIndexPath(docKey), index);
		return index;
	}

	private async migrateLegacyLayoutWithoutIndex(
		docKey: string,
		sourcePath: string
	): Promise<DocumentCacheIndex | null> {
		const hasSections = await this.adapter.exists(
			joinPath(this.legacySectionsModeRoot(docKey), 'index.json')
		);
		const hasStory = await this.adapter.exists(this.legacySingleStoryManifestPath(docKey));
		if (!hasSections && !hasStory) {
			return null;
		}

		const v1: DocumentCacheIndexV1 = {
			version: 1,
			sourcePath,
			sourceChecksum: '',
			activeProcessingMode: 'sections',
			modes: {
				sections: { status: hasSections ? 'ready' : 'none' },
				single_story: { status: hasStory ? 'ready' : 'none' }
			},
			updatedAt: new Date().toISOString()
		};

		if (hasSections) {
			const doc = await this.loadLegacySections(docKey);
			if (doc) {
				v1.modes.sections = {
					status: 'ready',
					preparedAt: doc.meta.processedAt,
					model: doc.meta.model,
					sourceChecksum: doc.meta.sourceChecksum
				};
				v1.sourceChecksum = doc.meta.sourceChecksum;
			}
		}
		if (hasStory) {
			const doc = await this.loadLegacySingleStory(docKey);
			if (doc) {
				v1.modes.single_story = {
					status: 'ready',
					preparedAt: doc.meta.processedAt,
					model: doc.meta.model,
					sourceChecksum: doc.meta.sourceChecksum
				};
				if (!v1.sourceChecksum) {
					v1.sourceChecksum = doc.meta.sourceChecksum;
				}
			}
		}

		return this.migrateFromV1(docKey, v1);
	}

	async deleteDocumentCache(sourcePath: string): Promise<boolean> {
		if (!this.cacheDelete) {
			return false;
		}
		const docKey = docKeyFromSourcePath(sourcePath);
		const { vaultAdapter, basePath } = this.cacheDelete;
		const existed = await readCacheDocKeyExists(vaultAdapter, basePath, docKey);
		if (!existed) {
			return false;
		}
		await removeReadCacheTree(vaultAdapter, basePath, docKey);
		return true;
	}

	async clearAllDocumentCache(): Promise<number> {
		if (!this.cacheDelete) {
			return 0;
		}
		const { vaultAdapter, basePath } = this.cacheDelete;
		const docKeys = await listReadCacheDocKeys(vaultAdapter, basePath);
		for (const docKey of docKeys) {
			await removeReadCacheTree(vaultAdapter, basePath, docKey);
		}
		return docKeys.length;
	}

	private async writeJson(path: string, data: unknown): Promise<void> {
		const dir = path.replace(/[/\\][^/\\]+$/, '');
		if (dir) {
			await this.adapter.mkdir(dir);
		}
		await this.adapter.write(path, `${JSON.stringify(data, null, 2)}\n`);
	}
}
