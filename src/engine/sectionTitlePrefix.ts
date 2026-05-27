import type { StreamToken } from '../types/processedDocument';

export type SectionNavLabel = 'Chapter' | 'Section';

export function buildSectionTitlePrefix(
	title: string | undefined,
	label: SectionNavLabel
): StreamToken {
	const trimmed = title?.trim() || label;
	return {
		kind: 'section_break',
		text: `${label} : ${trimmed}`
	};
}
