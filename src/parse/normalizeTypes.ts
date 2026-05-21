import type { SegmentKind } from './segmentTypes';

export interface NormalizedSegment {
	index: number;
	kind: SegmentKind;
	headingLevel?: number;
	title?: string;
	body?: string;
	table?: { headers: string[]; rows: string[][] };
	imageAlt?: string;
	embedTarget?: string;
	suggestedPauseMs?: number;
	skip?: boolean;
}

export interface SectionSegmentBundle {
	sectionId: string;
	title: string;
	level: number;
	order: number;
	segments: NormalizedSegment[];
}

export interface NormalizedDocumentBundle {
	sourcePath: string;
	sourceChecksum: string;
	sections: SectionSegmentBundle[];
	estimatedPayloadChars: number;
	estimatedPayloadLines?: number;
}
