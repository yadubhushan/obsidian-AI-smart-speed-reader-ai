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
		const cached = await this.get(docKey);
		const sourceExists = await this.app.vault.adapter.exists(sourcePath);
		if (!sourceExists) {
			if (cached) {
				return cached;
			}
			throw new Error(`EPUB file not found: ${sourcePath}`);
		}

		const bytes = await this.app.vault.adapter.readBinary(sourcePath);
		const checksum = await binaryChecksum(bytes);

		if (cached && cached.sourceChecksum === checksum) {
			return cached;
		}

		return this.parseAndWrite(sourcePath, bytes, options);
	}

	async rebuild(sourcePath: string, options?: EnsureParsedOptions): Promise<BookCacheIndex> {
		// Never touch the cache when the source is gone: it may be the only copy of the text.
		if (!(await this.app.vault.adapter.exists(sourcePath))) {
			throw new Error(`EPUB file not found: ${sourcePath}`);
		}
		const bytes = await this.app.vault.adapter.readBinary(sourcePath);
		return this.parseAndWrite(sourcePath, bytes, options);
	}

	private async parseAndWrite(
		sourcePath: string,
		bytes: ArrayBuffer,
		options?: EnsureParsedOptions
	): Promise<BookCacheIndex> {
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
			this.eventBus.emit('book-cache-updated', {
				docKey: docKeyFromSourcePath(sourcePath),
				sourcePath
			});
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
