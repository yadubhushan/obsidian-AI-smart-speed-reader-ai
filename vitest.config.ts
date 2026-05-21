import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Mirror esbuild `.txt` text loader so vitest sees bundled prompt content. */
function txtTextLoader() {
	return {
		name: 'txt-text-loader',
		enforce: 'pre' as const,
		load(id: string) {
			if (!id.endsWith('.txt')) {
				return null;
			}
			const text = readFileSync(id, 'utf8');
			return `export default ${JSON.stringify(text)}`;
		}
	};
}

export default defineConfig({
	plugins: [txtTextLoader()],
	resolve: {
		alias: {
			obsidian: path.resolve(rootDir, 'tests/obsidianMock.ts')
		}
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts']
	}
});
