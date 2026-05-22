import { parseNoteSegments } from '../parse/segmentParser';
import type { ParsedSegments } from '../parse/segmentTypes';
import { normalizeDocument } from '../parse/normalizeSegments';
import type { NormalizedDocumentBundle } from '../parse/normalizeTypes';
import { processDocument } from '../prepare/processDocument';
import { docKeyFromSourcePath } from '../store/docKey';
import type { ManifestStore } from '../store/ManifestStore';
import {
	activeVersionEntry,
	activeVersionStatus,
	isVersionReady,
	latestReadyVersion,
	resolveDefaultActiveVersionId
} from '../store/cacheIndexUtils';
import type { RSVPEngine } from '../engine/rsvpEngine';
import type { SpeedReaderAiSettings } from '../types';
import type {
	DocumentCacheIndex,
	PrepareVersionEntry,
	ProcessedDocument,
	ProcessingModeId,
	ProcessorDeps
} from '../types/processedDocument';

export type PlaybackLoadKind = 'ai' | 'deterministic';

export interface LoadPlaybackOptions {
	/** Mobile: always use latest ready version, ignore user selection. */
	preferLatestReady?: boolean;
	preferredVersionId?: string | null;
}

export class StructuredReaderSession {
	bundle: NormalizedDocumentBundle;
	parsed: ParsedSegments;
	readonly docKey: string;
	private index: DocumentCacheIndex | null = null;
	activeModeId: ProcessingModeId = 'sections';
	activeVersionId: string | null = null;

	constructor(
		private readonly store: ManifestStore,
		sourcePath: string,
		sourceText: string,
		checksum: string,
		readonly startOffset: number,
		private readonly settings: Pick<SpeedReaderAiSettings, 'bookmarks' | 'ai'>
	) {
		this.parsed = parseNoteSegments(sourceText, settings, {
			fileName: sourcePath.replace(/^.*[/\\]/, '')
		});
		this.bundle = normalizeDocument(this.parsed, sourcePath, checksum);
		this.docKey = docKeyFromSourcePath(sourcePath);
	}

	async reloadFromVaultText(
		sourceText: string,
		checksum: string,
		engine: RSVPEngine,
		position?: { sectionIndex?: number; tokenIndex?: number },
		playbackOptions?: LoadPlaybackOptions
	): Promise<PlaybackLoadKind> {
		const sectionIndex = position?.sectionIndex;
		const tokenIndex = position?.tokenIndex;

		this.parsed = parseNoteSegments(sourceText, this.settings, {
			fileName: this.bundle.sourcePath.replace(/^.*[/\\]/, '')
		});
		this.bundle = normalizeDocument(this.parsed, this.bundle.sourcePath, checksum);
		this.index = await this.store.markStaleIfChecksumMismatch(
			this.bundle.sourcePath,
			checksum
		);
		this.index =
			(await this.store.reconcileStaleModes(this.bundle.sourcePath, checksum)) ??
			this.index;
		this.resolveActiveVersion(playbackOptions);

		const modeId = activeVersionEntry(this.index!)?.modeId ?? this.activeModeId;
		const kind = await this.loadPlayback(engine, modeId, playbackOptions);

		if (sectionIndex !== undefined) {
			engine.goToSection(sectionIndex);
		}
		if (tokenIndex !== undefined) {
			engine.seekToToken(tokenIndex);
		}
		return kind;
	}

	async initialize(
		preferredProcessingMode?: ProcessingModeId,
		options?: LoadPlaybackOptions
	): Promise<void> {
		this.index = await this.store.markStaleIfChecksumMismatch(
			this.bundle.sourcePath,
			this.bundle.sourceChecksum
		);
		this.index =
			(await this.store.reconcileStaleModes(
				this.bundle.sourcePath,
				this.bundle.sourceChecksum
			)) ?? this.index;
		this.activeModeId =
			preferredProcessingMode ?? this.index?.activeProcessingMode ?? 'sections';
		this.resolveActiveVersion(options);
	}

	private resolveActiveVersion(options?: LoadPlaybackOptions): void {
		if (!this.index) {
			this.activeVersionId = null;
			return;
		}
		if (options?.preferLatestReady) {
			const latest = latestReadyVersion(this.index, this.bundle.sourceChecksum);
			this.activeVersionId = latest?.id ?? null;
			if (latest) {
				this.activeModeId = latest.modeId;
			}
			return;
		}
		const resolved = resolveDefaultActiveVersionId(
			this.index,
			this.bundle.sourceChecksum,
			options?.preferredVersionId ?? this.activeVersionId
		);
		this.activeVersionId = resolved;
		if (resolved) {
			const entry = this.index.versions.find((v) => v.id === resolved);
			if (entry) {
				this.activeModeId = entry.modeId;
			}
		}
	}

	get cacheIndex(): DocumentCacheIndex | null {
		return this.index;
	}

	listVersionsForUi(): PrepareVersionEntry[] {
		if (!this.index) {
			return [];
		}
		return this.store.listVersions(this.index);
	}

	async refreshIndex(): Promise<DocumentCacheIndex | null> {
		this.index = await this.store.getDocumentIndex(this.bundle.sourcePath);
		return this.index;
	}

	isActiveVersionReady(): boolean {
		return isVersionReady(this.index, this.activeVersionId);
	}

	isModeReady(_modeId: ProcessingModeId = this.activeModeId): boolean {
		return this.isActiveVersionReady();
	}

	modeStatus(_modeId: ProcessingModeId = this.activeModeId) {
		return activeVersionStatus(this.index);
	}

	async setActiveVersion(versionId: string): Promise<void> {
		await this.store.setActiveVersion(this.bundle.sourcePath, versionId);
		this.activeVersionId = versionId;
		await this.refreshIndex();
		const entry = this.index?.versions.find((v) => v.id === versionId);
		if (entry) {
			this.activeModeId = entry.modeId;
		}
	}

	async setActiveMode(modeId: ProcessingModeId): Promise<void> {
		await this.store.setActiveMode(this.bundle.sourcePath, modeId);
		this.activeModeId = modeId;
		await this.refreshIndex();
	}

	async loadPlayback(
		engine: RSVPEngine,
		modeId: ProcessingModeId = this.activeModeId,
		options?: LoadPlaybackOptions
	): Promise<PlaybackLoadKind> {
		if (options?.preferLatestReady) {
			this.resolveActiveVersion({ preferLatestReady: true });
		} else if (!this.activeVersionId) {
			this.resolveActiveVersion(options);
		}

		const versionId = this.activeVersionId;
		if (versionId && this.isActiveVersionReady()) {
			const doc = await this.store.loadVersion(this.docKey, versionId);
			if (doc) {
				this.activeModeId = doc.processorId;
				engine.loadProcessedDocument(doc, { isDeterministic: false });
				return 'ai';
			}
		}

		this.activeModeId = modeId;
		engine.loadDeterministic(this.bundle, modeId, {
			parsed: this.parsed,
			editorOffset: this.startOffset
		});
		return 'deterministic';
	}

	async prepareWithAi(
		modeId: ProcessingModeId,
		deps: ProcessorDeps,
		engine: RSVPEngine
	): Promise<ProcessedDocument> {
		const processed = await processDocument(modeId, this.bundle, deps);
		const entry = await this.store.saveProcessedDocument(
			this.docKey,
			processed,
			this.settings.ai.maxPrepareVersions
		);
		this.activeVersionId = entry.id;
		this.activeModeId = entry.modeId;
		await this.refreshIndex();
		engine.loadProcessedDocument(processed, { isDeterministic: false });
		return processed;
	}

	loadDeterministic(engine: RSVPEngine, modeId: ProcessingModeId = this.activeModeId): void {
		this.activeModeId = modeId;
		engine.loadDeterministic(this.bundle, modeId, {
			parsed: this.parsed,
			editorOffset: this.startOffset
		});
	}

	async clearCache(engine: RSVPEngine): Promise<boolean> {
		const removed = await this.store.deleteDocumentCache(this.bundle.sourcePath);
		this.index = null;
		this.activeVersionId = null;
		this.loadDeterministic(engine, this.activeModeId);
		return removed;
	}
}
