import type { DataAdapter } from 'obsidian';
import type { EventBus } from '../services/eventBus';
import { ensureParentFolderForFile } from '../utils/vaultAdapterDirs';

/** User-chosen display metadata for a library book. Files on disk are never renamed. */
export interface BookDisplayOverride {
	title?: string;
	author?: string;
	updatedAt: string;
}

interface LibraryMetadataFile {
	version: 1;
	books: Record<string, BookDisplayOverride>;
}

function emptyFile(): LibraryMetadataFile {
	return { version: 1, books: {} };
}

function normalizeField(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export class LibraryMetadataStore {
	private file: LibraryMetadataFile = emptyFile();

	constructor(
		private readonly adapter: DataAdapter,
		private readonly filePath: string,
		private readonly eventBus: EventBus
	) {}

	/** Re-read from disk so edits from other synced devices show up. */
	async reload(): Promise<void> {
		this.file = await this.readDisk();
	}

	get(sourcePath: string): BookDisplayOverride | undefined {
		return this.file.books[sourcePath];
	}

	/** Set or clear (empty fields) the display title/author for a book. */
	async setDisplay(
		sourcePath: string,
		next: { title?: string; author?: string }
	): Promise<void> {
		const fresh = await this.readDisk();
		const title = normalizeField(next.title);
		const author = normalizeField(next.author);
		if (!title && !author) {
			delete fresh.books[sourcePath];
		} else {
			fresh.books[sourcePath] = { title, author, updatedAt: new Date().toISOString() };
		}
		await ensureParentFolderForFile(this.adapter, this.filePath);
		await this.adapter.write(this.filePath, JSON.stringify(fresh, null, 2));
		this.file = fresh;
		this.eventBus.emit('library-metadata-changed', { sourcePath });
	}

	private async readDisk(): Promise<LibraryMetadataFile> {
		try {
			if (!(await this.adapter.exists(this.filePath))) {
				return emptyFile();
			}
			const parsed = JSON.parse(await this.adapter.read(this.filePath)) as Partial<LibraryMetadataFile>;
			return { version: 1, books: parsed.books ?? {} };
		} catch {
			return emptyFile();
		}
	}
}
