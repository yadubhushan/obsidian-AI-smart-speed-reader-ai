import type { App } from 'obsidian';
import { binaryChecksum } from '../crypto-checksum';
import type { EventBus } from '../services/eventBus';
import { docKeyFromSourcePath } from './docKey';
import {
	bookCacheCoverPath,
	bookCacheDocKeyPath,
	bookCacheIndexPath,
	bookCacheMetadataPath,
	removeBookCacheTree
} from './bookCachePaths';
import type { LlmClient } from '../llm/LlmClient';
import type {
	BookCacheIndex,
	BookCacheStore,
	EnsureParsedOptions,
	SourceFormatProcessor
} from '../types/m2Contracts';
import { parseEpubBytes } from '../formats/epub/epubParse';

export class BookCacheStoreImpl implements BookCacheStore {
	constructor(
		private readonly app: App,
		private readonly processor: SourceFormatProcessor,
		private readonly eventBus: EventBus,
		private readonly basePath: string,
		private readonly getLlm?: () => LlmClient | undefined
	) {}

	async get(docKey: string): Promise<BookCacheIndex | null> {
		const adapter = this.app.vault.adapter;
		const indexPath = bookCacheIndexPath(this.basePath, docKey);
		try {
			const raw = await adapter.read(indexPath);
			return JSON.parse(raw) as BookCacheIndex;
		} catch {
			return null;
		}
	}

	async ensureParsed(sourcePath: string, options?: EnsureParsedOptions): Promise<BookCacheIndex> {
		const docKey = docKeyFromSourcePath(sourcePath);
		const bytes = await this.app.vault.adapter.readBinary(sourcePath);
		const checksum = await binaryChecksum(bytes);
		const cached = await this.get(docKey);

		if (cached && cached.sourceChecksum === checksum) {
			return cached;
		}

		const report = options?.onProgress;
		report?.('Parsing EPUB…');

		try {
			const { index, coverBytes } = await parseEpubBytes(sourcePath, bytes, {
				llm: this.getLlm?.(),
				onLlmChapterIndexStart: () => {
					report?.('Naming chapters with AI…');
				},
				onLlmChapterIndexEnd: () => {
					report?.('Parsing EPUB…');
				}
			});
			await this.writeIndex(index, coverBytes);
			this.eventBus.emit('book-cache-updated', { docKey, sourcePath });
			return index;
		} finally {
			report?.(null);
		}
	}

	async invalidate(docKey: string): Promise<void> {
		await removeBookCacheTree(this.app.vault.adapter, this.basePath, docKey);
	}

	private async writeIndex(index: BookCacheIndex, coverBytes: Uint8Array | null): Promise<void> {
		const adapter = this.app.vault.adapter;
		const docDir = bookCacheDocKeyPath(this.basePath, index.docKey);
		await adapter.mkdir(docDir).catch(() => undefined);

		await adapter.write(
			bookCacheIndexPath(this.basePath, index.docKey),
			JSON.stringify(index, null, 2)
		);

		await adapter.write(
			bookCacheMetadataPath(this.basePath, index.docKey),
			JSON.stringify(
				{
					title: index.title,
					author: index.author,
					sourcePath: index.sourcePath,
					parsedAt: index.parsedAt
				},
				null,
				2
			)
		);

		if (coverBytes && coverBytes.length > 0) {
			const buffer = coverBytes.buffer.slice(
				coverBytes.byteOffset,
				coverBytes.byteOffset + coverBytes.byteLength
			) as ArrayBuffer;
			await adapter.writeBinary(bookCacheCoverPath(this.basePath, index.docKey), buffer);
		}
	}
}
