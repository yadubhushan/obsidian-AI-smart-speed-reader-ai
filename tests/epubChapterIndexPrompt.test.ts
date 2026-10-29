import { describe, expect, it } from 'vitest';
import {
	buildUserPrompt,
	resolveChapterTitlesViaLlm,
	type SpineTitleSnapshot
} from '../src/formats/epub/epubChapterIndexLlm';
import type { LlmClient } from '../src/llm/LlmClient';

const snapshots: SpineTitleSnapshot[] = [
	{ spineIndex: 0, path: 'cover.xhtml', currentTitle: 'Cover', wordCount: 0 },
	{ spineIndex: 1, path: 'title.xhtml', currentTitle: 'Section 2', wordCount: 4, excerpt: 'Atlas Shrugged Ayn Rand' },
	{ spineIndex: 2, path: 'ch1.xhtml', currentTitle: 'The Theme', wordCount: 9000 },
	{ spineIndex: 3, path: 'ch2.xhtml', currentTitle: 'The Chain', wordCount: 8000 },
	{ spineIndex: 4, path: 'ch3.xhtml', currentTitle: 'The Top and the Bottom', wordCount: 7000 }
];

function recordingLlm(reply: string): LlmClient & { prompts: string[] } {
	const prompts: string[] = [];
	return {
		prompts,
		async complete(_s, u) {
			prompts.push(u);
			return reply;
		}
	};
}

describe('chapter index prompt', () => {
	it('sends only unresolved sections plus titled neighbours', () => {
		const prompt = buildUserPrompt({ bookTitle: 'Atlas Shrugged', spineSnapshots: snapshots, specialPages: [] });
		expect(prompt).toContain('1: title.xhtml | title="Section 2"');
		expect(prompt).toContain('excerpt="Atlas Shrugged Ayn Rand"');
		expect(prompt).toContain('0: cover.xhtml');
		expect(prompt).toContain('2: ch1.xhtml');
		expect(prompt).not.toContain('ch2.xhtml');
		expect(prompt).not.toContain('ch3.xhtml');
	});

	it('includes the contents page only when an unresolved section is chapter-sized', () => {
		const contents = [{ spineIndex: 9, plainText: 'Contents\nPart One', pageKind: 'contents' }];
		const short = buildUserPrompt({ bookTitle: 'B', spineSnapshots: snapshots, specialPages: contents });
		expect(short).not.toContain('Part One');
		const long = buildUserPrompt({
			bookTitle: 'B',
			spineSnapshots: [{ spineIndex: 0, path: 'a.xhtml', currentTitle: 'Section 1', wordCount: 5000 }],
			specialPages: contents
		});
		expect(long).toContain('Part One');
	});

	it('skips the call entirely when every section already has a title', async () => {
		const llm = recordingLlm('{}');
		const titled = snapshots.filter((s) => s.spineIndex !== 1);
		const result = await resolveChapterTitlesViaLlm(llm, { bookTitle: 'B', spineSnapshots: titled, specialPages: [] });
		expect(llm.prompts).toHaveLength(0);
		expect(result.titles.size).toBe(0);
	});

	it('ignores titles returned for sections that were not asked about', async () => {
		const llm = recordingLlm(
			'```json\n{"chapters":[{"spineIndex":1,"title":"Title Page","kind":"frontMatter"},{"spineIndex":2,"title":"Chapter 1"}]}\n```'
		);
		const result = await resolveChapterTitlesViaLlm(llm, { bookTitle: 'B', spineSnapshots: snapshots, specialPages: [] });
		expect(llm.prompts).toHaveLength(1);
		expect(result.titles.get(1)).toBe('Title Page');
		expect(result.titles.has(2)).toBe(false);
	});
	it('does not ask about image-only pages', async () => {
		const llm = recordingLlm('{}');
		await resolveChapterTitlesViaLlm(llm, {
			bookTitle: 'B',
			spineSnapshots: [{ spineIndex: 0, path: 'cover.xhtml', currentTitle: 'Section 1', wordCount: 0 }],
			specialPages: []
		});
		expect(llm.prompts).toHaveLength(0);
	});
});
