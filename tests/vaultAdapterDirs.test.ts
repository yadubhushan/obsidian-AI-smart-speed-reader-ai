import { describe, expect, it } from 'vitest';
import {
	ensureFolderPath,
	ensureParentFolderForFile
} from '../src/utils/vaultAdapterDirs';

describe('vaultAdapterDirs', () => {
	it('creates nested plugin data path segment by segment', async () => {
		const created: string[] = [];
		const adapter = {
			mkdir: async (path: string) => {
				created.push(path);
			}
		};
		await ensureFolderPath(
			adapter,
			'.obsidian/plugins/speed-reader-ai/data/prompts'
		);
		expect(created).toEqual([
			'.obsidian',
			'.obsidian/plugins',
			'.obsidian/plugins/speed-reader-ai',
			'.obsidian/plugins/speed-reader-ai/data',
			'.obsidian/plugins/speed-reader-ai/data/prompts'
		]);
	});

	it('creates parents for a file path', async () => {
		const created: string[] = [];
		const adapter = {
			mkdir: async (path: string) => {
				created.push(path);
			}
		};
		await ensureParentFolderForFile(
			adapter,
			'.obsidian/plugins/speed-reader-ai/data/llm-models.json'
		);
		expect(created).toEqual([
			'.obsidian',
			'.obsidian/plugins',
			'.obsidian/plugins/speed-reader-ai',
			'.obsidian/plugins/speed-reader-ai/data'
		]);
	});
});
