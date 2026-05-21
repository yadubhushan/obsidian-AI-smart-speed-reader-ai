export type SegmentKind =
	| 'heading'
	| 'paragraph'
	| 'table'
	| 'callout'
	| 'blockquote'
	| 'list'
	| 'code_block'
	| 'image'
	| 'embed'
	| 'hr'
	| 'frontmatter';

export interface DocumentSegment {
	kind: SegmentKind;
	start: number;
	end: number;
	lines: string[];
	meta?: Record<string, unknown>;
}

export interface DocumentSection {
	id: string;
	title: string;
	level: number;
	order: number;
	segmentStart: number;
	segmentEnd: number;
}

export interface ParseSegmentsOptions {
	fileName?: string;
	/** ATX H1 title; lines from first matching H1 through EOF are excluded (note bookmarks). */
	bookmarkSectionHeading?: string;
}

export interface ParsedSegments {
	segments: DocumentSegment[];
	sections: DocumentSection[];
	sourceLength: number;
}
