import { parseNoteSegments } from '../parse/segmentParser';
import type { ParsedSegments } from '../parse/segmentTypes';
import { normalizeDocument } from '../parse/normalizeSegments';
import type { NormalizedDocumentBundle } from '../parse/normalizeTypes';
import { processDocument } from '../prepare/processDocument';
import { docKeyFromSourcePath } from '../store/docKey';
import type { ManifestStore } from '../store/ManifestStore';
import type { RSVPEngine } from '../engine/rsvpEngine';
import type { SpeedReaderAiSettings } from '../types';
import type {
	DocumentCacheIndex,
	ProcessedDocument,
	ProcessingModeId,
	ProcessorDeps
} from '../types/processedDocument';

export type PlaybackLoadKind = 'ai' | 'deterministic';

export class StructuredReaderSession {
	bundle: NormalizedDocumentBundle;
	parsed: ParsedSegments;
	readonly docKey: string;
	private index: DocumentCacheIndex | null = null;
	activeModeId: ProcessingModeId = 'sections';

	constructor(
		private readonly store: ManifestStore,
		sourcePath: string,
		sourceText: string,
		checksum: string,
		readonly startOffset: number,
		private readonly settings: Pick<SpeedReaderAiSettings, 'bookmarks'>
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
		position?: { sectionIndex?: number; tokenIndex?: number }
	): Promise<void> {
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

		engine.loadDeterministic(this.bundle, this.activeModeId, {
			parsed: this.parsed,
			editorOffset: this.startOffset
		});

		if (sectionIndex !== undefined) {
			engine.goToSection(sectionIndex);
		}
		if (tokenIndex !== undefined) {
			engine.seekToToken(tokenIndex);
		}
	}

	async initialize(preferredProcessingMode?: ProcessingModeId): Promise<void> {
		this.index = await this.store.markStaleIfChecksumMismatch(
			this.bundle.sourcePath,
			this.bundle.sourceChecksum
		);
		this.activeModeId =
			preferredProcessingMode ?? this.index?.activeProcessingMode ?? 'sections';
	}

	get cacheIndex(): DocumentCacheIndex | null {
		return this.index;
	}

	async refreshIndex(): Promise<DocumentCacheIndex | null> {
		this.index = await this.store.getDocumentIndex(this.bundle.sourcePath);
		return this.index;
	}

	isModeReady(modeId: ProcessingModeId = this.activeModeId): boolean {
		return this.index?.modes[modeId]?.status === 'ready';
	}

	modeStatus(modeId: ProcessingModeId = this.activeModeId) {
		return this.index?.modes[modeId]?.status ?? 'none';
	}

	async setActiveMode(modeId: ProcessingModeId): Promise<void> {
		await this.store.setActiveMode(this.bundle.sourcePath, modeId);
		this.activeModeId = modeId;
		await this.refreshIndex();
	}

	async loadPlayback(engine: RSVPEngine, modeId: ProcessingModeId = this.activeModeId): Promise<PlaybackLoadKind> {
		this.activeModeId = modeId;
		if (this.isModeReady(modeId)) {
			const doc = await this.store.loadProcessedDocument(this.docKey, modeId);
			if (doc) {
				engine.loadProcessedDocument(doc, { isDeterministic: false });
				return 'ai';
			}
		}
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
		await this.store.saveProcessedDocument(this.docKey, processed);
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
		this.loadDeterministic(engine, this.activeModeId);
		return removed;
	}
}
