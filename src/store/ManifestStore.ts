import type { DataAdapter } from 'obsidian';
import type {
	DocumentCacheIndex,
	ModeCacheEntry,
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
	parseSectionsModeIndex,
	parseSingleStoryManifest,
	parseSpeedReadSectionManifest
} from '../prepare/validateProcessedDocument';

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

function emptyModeEntry(): ModeCacheEntry {
	return { status: 'none' };
}

function defaultDocumentIndex(
	sourcePath: string,
	sourceChecksum: string
): DocumentCacheIndex {
	const now = new Date().toISOString();
	return {
		version: 1,
		sourcePath,
		sourceChecksum,
		activeProcessingMode: 'sections',
		modes: {
			sections: emptyModeEntry(),
			single_story: emptyModeEntry()
		},
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

	private sectionsModeRoot(docKey: string): string {
		return joinPath(this.docRoot(docKey), 'modes', 'sections');
	}

	private singleStoryManifestPath(docKey: string): string {
		return joinPath(this.docRoot(docKey), 'modes', 'single_story', 'manifest.json');
	}

	async getDocumentIndex(sourcePath: string): Promise<DocumentCacheIndex | null> {
		const docKey = docKeyFromSourcePath(sourcePath);
		const path = this.rootIndexPath(docKey);
		if (!(await this.adapter.exists(path))) {
			return null;
		}
		try {
			const text = await this.adapter.read(path);
			const parsed: unknown = JSON.parse(text);
			const index = parseDocumentCacheIndex(parsed);
			if (!index || index.sourcePath !== sourcePath) {
				return null;
			}
			return index;
		} catch {
			return null;
		}
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
		for (const modeId of ['sections', 'single_story'] as const) {
			const entry = index.modes[modeId];
			if (entry.status === 'ready') {
				index.modes[modeId] = { ...entry, status: 'stale' };
			}
		}
		await this.writeJson(this.rootIndexPath(docKey), index);
		return index;
	}

	async saveProcessedDocument(
		docKey: string,
		processed: ProcessedDocument
	): Promise<void> {
		if (processed.kind === 'sections') {
			await this.saveSectionsDocument(docKey, processed);
		} else {
			await this.saveSingleStoryDocument(docKey, processed);
		}
		await this.updateRootIndexAfterSave(docKey, processed);
	}

	private async saveSectionsDocument(
		docKey: string,
		processed: Extract<ProcessedDocument, { kind: 'sections' }>
	): Promise<void> {
		const modeRoot = this.sectionsModeRoot(docKey);
		const sectionsDir = joinPath(modeRoot, 'sections');
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
		await this.writeJson(joinPath(modeRoot, 'index.json'), modeIndex);

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
			await this.writeJson(
				joinPath(sectionsDir, `${section.sectionId}.json`),
				manifest
			);
		}
	}

	private async saveSingleStoryDocument(
		docKey: string,
		processed: Extract<ProcessedDocument, { kind: 'single_story' }>
	): Promise<void> {
		const manifestPath = this.singleStoryManifestPath(docKey);
		await this.adapter.mkdir(joinPath(this.docRoot(docKey), 'modes', 'single_story'));
		const manifest: SingleStoryManifest = {
			version: 1,
			sourcePath: processed.meta.sourcePath,
			sourceChecksum: processed.meta.sourceChecksum,
			preparedAt: processed.meta.processedAt,
			prepareStrategy: processed.meta.prepareStrategy,
			model: processed.meta.model,
			stream: processed.stream
		};
		await this.writeJson(manifestPath, manifest);
	}

	private async updateRootIndexAfterSave(
		docKey: string,
		processed: ProcessedDocument
	): Promise<void> {
		const sourcePath = processed.meta.sourcePath;
		let index = await this.getDocumentIndex(sourcePath);
		if (!index) {
			index = defaultDocumentIndex(
				sourcePath,
				processed.meta.sourceChecksum
			);
		}
		index.sourceChecksum = processed.meta.sourceChecksum;
		index.updatedAt = new Date().toISOString();
		const modeId = processed.processorId;
		index.modes[modeId] = {
			status: 'ready',
			preparedAt: processed.meta.processedAt,
			model: processed.meta.model,
			sourceChecksum: processed.meta.sourceChecksum
		};
		await this.writeJson(this.rootIndexPath(docKey), index);
	}

	async loadProcessedDocument(
		docKey: string,
		modeId: ProcessingModeId
	): Promise<ProcessedDocument | null> {
		if (modeId === 'sections') {
			return this.loadSectionsDocument(docKey);
		}
		return this.loadSingleStoryDocument(docKey);
	}

	private async loadSectionsDocument(docKey: string): Promise<ProcessedDocument | null> {
		const modeRoot = this.sectionsModeRoot(docKey);
		const indexPath = joinPath(modeRoot, 'index.json');
		if (!(await this.adapter.exists(indexPath))) {
			return null;
		}
		try {
			const indexText = await this.adapter.read(indexPath);
			const modeIndex = parseSectionsModeIndex(JSON.parse(indexText));
			if (!modeIndex) {
				return null;
			}
			const sectionsDir = joinPath(modeRoot, 'sections');
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

	private async loadSingleStoryDocument(
		docKey: string
	): Promise<ProcessedDocument | null> {
		const manifestPath = this.singleStoryManifestPath(docKey);
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
