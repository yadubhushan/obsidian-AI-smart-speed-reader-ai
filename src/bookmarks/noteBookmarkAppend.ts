const ATX_H1_RE = /^#\s+(.*)$/;

function headingTitleFromLine(line: string): string | null {
	const match = line.match(ATX_H1_RE);
	return match ? (match[1] ?? '').trim() : null;
}

/** Index of last line that starts an ATX H1 matching the bookmark heading, or -1. */
export function findBookmarkSectionLineIndex(content: string, heading: string): number {
	const lines = content.replace(/\r\n/g, '\n').split('\n');
	for (let index = lines.length - 1; index >= 0; index--) {
		const title = headingTitleFromLine(lines[index] ?? '');
		if (title === heading) {
			return index;
		}
	}
	return -1;
}

/**
 * Append bookmark block at EOF. Creates `# heading` section once if missing.
 * Never modifies content above an existing bookmark section.
 */
export function appendNoteBookmark(
	content: string,
	heading: string,
	block: string
): string {
	const normalized = content.replace(/\r\n/g, '\n');
	const sectionIndex = findBookmarkSectionLineIndex(normalized, heading);

	if (sectionIndex < 0) {
		const prefix = normalized.length === 0 ? '' : normalized.endsWith('\n') ? normalized : `${normalized}\n`;
		return `${prefix}\n# ${heading}\n\n${block}`;
	}

	const lines = normalized.split('\n');
	const before = lines.slice(0, sectionIndex + 1).join('\n');
	const tail = lines.slice(sectionIndex + 1).join('\n').trimEnd();
	const gap = tail.length > 0 ? '\n\n' : '\n';
	return `${before}${gap}${tail.length > 0 ? `${tail}\n\n` : ''}${block}`;
}
