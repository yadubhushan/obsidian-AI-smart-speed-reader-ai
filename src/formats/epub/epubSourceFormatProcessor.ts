import type { App } from 'obsidian';
import { parseEpubBytes } from './epubParse';
import type { BookCacheIndex, SourceFormatProcessor } from '../../types/m2Contracts';

export function createEpubSourceFormatProcessor(app: App): SourceFormatProcessor {
	return {
		formatId: 'epub',
		extensions: ['.epub'],

		canProcess(path: string): boolean {
			return path.toLowerCase().endsWith('.epub');
		},

		async parseToBookIndex(sourcePath: string): Promise<BookCacheIndex> {
			const bytes = await app.vault.adapter.readBinary(sourcePath);
			const { index } = await parseEpubBytes(sourcePath, bytes);
			return index;
		}
	};
}
