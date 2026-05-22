import type {
	DocumentCacheIndex,
	DocumentCacheIndexV1,
	PrepareVersionEntry,
	VersionCacheStatus,
	LlmSectionsResponse,
	LlmStoryResponse,
	ModeCacheEntry,
	ProcessedDocument,
	ProcessedSection,
	SectionsModeIndex,
	SingleStoryManifest,
	SpeedReadSectionManifest,
	StreamToken,
	StreamTokenKind
} from '../types/processedDocument';
import { bodyToStream } from './proseToStream';

const STREAM_TOKEN_KINDS: StreamTokenKind[] = [
	'word',
	'pause',
	'image',
	'section_break'
];

function isRecord(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isNonEmptyString(x: unknown): x is string {
	return typeof x === 'string' && x.trim().length > 0;
}

export function parseStreamToken(raw: unknown): StreamToken | null {
	if (!isRecord(raw)) {
		return null;
	}
	const kind = raw.kind;
	if (typeof kind !== 'string' || !STREAM_TOKEN_KINDS.includes(kind as StreamTokenKind)) {
		return null;
	}
	const token: StreamToken = { kind: kind as StreamTokenKind };
	if (raw.text !== undefined) {
		if (typeof raw.text !== 'string') {
			return null;
		}
		token.text = raw.text;
	}
	if (raw.orpIndex !== undefined) {
		if (typeof raw.orpIndex !== 'number' || !Number.isInteger(raw.orpIndex)) {
			return null;
		}
		token.orpIndex = raw.orpIndex;
	}
	if (raw.alt !== undefined) {
		if (typeof raw.alt !== 'string') {
			return null;
		}
		token.alt = raw.alt;
	}
	if (raw.pauseMs !== undefined) {
		if (typeof raw.pauseMs !== 'number' || raw.pauseMs < 0) {
			return null;
		}
		token.pauseMs = raw.pauseMs;
	}
	if (kind === 'word' && !token.text?.length) {
		return null;
	}
	return token;
}

function parseStreamTokens(raw: unknown): StreamToken[] | null {
	if (!Array.isArray(raw)) {
		return null;
	}
	const tokens: StreamToken[] = [];
	for (const item of raw) {
		const t = parseStreamToken(item);
		if (!t) {
			return null;
		}
		tokens.push(t);
	}
	return tokens;
}

export function parseLlmSectionsResponse(raw: string): LlmSectionsResponse | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(parsed) || !Array.isArray(parsed.sections)) {
		return null;
	}
	const sections: LlmSectionsResponse['sections'] = [];
	for (const item of parsed.sections) {
		if (!isRecord(item) || !isNonEmptyString(item.title) || typeof item.body !== 'string') {
			return null;
		}
		const body = item.body.trim();
		if (!body) {
			return null;
		}
		const stream = bodyToStream(body);
		if (stream.length === 0) {
			return null;
		}
		sections.push({ title: item.title.trim(), body });
	}
	if (sections.length === 0) {
		return null;
	}
	return { sections };
}

export function parseLlmStoryResponse(raw: string): LlmStoryResponse | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(parsed) || typeof parsed.body !== 'string') {
		return null;
	}
	const body = parsed.body.trim();
	if (!body) {
		return null;
	}
	const stream = bodyToStream(body);
	if (stream.length === 0) {
		return null;
	}
	return { body };
}

export function validateProcessedSection(raw: unknown): ProcessedSection | null {
	if (!isRecord(raw)) {
		return null;
	}
	if (!isNonEmptyString(raw.sectionId) || !isNonEmptyString(raw.title)) {
		return null;
	}
	const stream = parseStreamTokens(raw.stream);
	if (!stream || stream.length === 0) {
		return null;
	}
	const section: ProcessedSection = {
		sectionId: raw.sectionId.trim(),
		title: raw.title.trim(),
		stream
	};
	if (Array.isArray(raw.paragraphStarts)) {
		const starts = raw.paragraphStarts.filter((n): n is number => typeof n === 'number' && n >= 0);
		if (starts.length > 0) {
			section.paragraphStarts = starts;
		}
	}
	return section;
}

export function validateProcessedDocument(raw: unknown): ProcessedDocument | null {
	if (!isRecord(raw) || !isRecord(raw.meta)) {
		return null;
	}
	const meta = raw.meta;
	if (
		!isNonEmptyString(meta.sourcePath) ||
		!isNonEmptyString(meta.sourceChecksum) ||
		!isNonEmptyString(meta.processedAt) ||
		!isNonEmptyString(meta.model) ||
		(meta.prepareStrategy !== 'single' && meta.prepareStrategy !== 'batched')
	) {
		return null;
	}
	const processedMeta = {
		sourcePath: meta.sourcePath,
		sourceChecksum: meta.sourceChecksum,
		processedAt: meta.processedAt,
		model: meta.model,
		prepareStrategy: meta.prepareStrategy as 'single' | 'batched'
	};

	if (raw.kind === 'sections' && raw.processorId === 'sections') {
		if (!Array.isArray(raw.sections)) {
			return null;
		}
		const sections: ProcessedSection[] = [];
		for (const s of raw.sections) {
			const ps = validateProcessedSection(s);
			if (!ps) {
				return null;
			}
			sections.push(ps);
		}
		if (sections.length === 0) {
			return null;
		}
		return {
			kind: 'sections',
			processorId: 'sections',
			meta: processedMeta,
			sections
		};
	}

	if (raw.kind === 'single_story' && raw.processorId === 'single_story') {
		const stream = parseStreamTokens(raw.stream);
		if (!stream || stream.length === 0) {
			return null;
		}
		const doc: Extract<ProcessedDocument, { kind: 'single_story' }> = {
			kind: 'single_story',
			processorId: 'single_story',
			meta: processedMeta,
			stream
		};
		if (Array.isArray(raw.paragraphStarts)) {
			const starts = raw.paragraphStarts.filter((n): n is number => typeof n === 'number' && n >= 0);
			if (starts.length > 0) {
				doc.paragraphStarts = starts;
			}
		}
		return doc;
	}

	return null;
}

function parseModeCacheEntry(raw: unknown): ModeCacheEntry | null {
	if (!isRecord(raw)) {
		return null;
	}
	const status = raw.status;
	if (
		status !== 'none' &&
		status !== 'ready' &&
		status !== 'stale' &&
		status !== 'error'
	) {
		return null;
	}
	const entry: ModeCacheEntry = { status };
	if (raw.preparedAt !== undefined) {
		if (typeof raw.preparedAt !== 'string') {
			return null;
		}
		entry.preparedAt = raw.preparedAt;
	}
	if (raw.model !== undefined) {
		if (typeof raw.model !== 'string') {
			return null;
		}
		entry.model = raw.model;
	}
	if (raw.sourceChecksum !== undefined) {
		if (typeof raw.sourceChecksum !== 'string') {
			return null;
		}
		entry.sourceChecksum = raw.sourceChecksum;
	}
	return entry;
}

function parseVersionCacheStatus(raw: unknown): VersionCacheStatus | null {
	if (raw === 'ready' || raw === 'stale' || raw === 'error') {
		return raw;
	}
	return null;
}

function parsePrepareVersionEntry(raw: unknown): PrepareVersionEntry | null {
	if (!isRecord(raw)) {
		return null;
	}
	const modeId = raw.modeId;
	if (modeId !== 'sections' && modeId !== 'single_story') {
		return null;
	}
	const status = parseVersionCacheStatus(raw.status);
	if (
		!status ||
		!isNonEmptyString(raw.id) ||
		typeof raw.number !== 'number' ||
		!isNonEmptyString(raw.preparedAt) ||
		!isNonEmptyString(raw.model) ||
		!isNonEmptyString(raw.sourceChecksum)
	) {
		return null;
	}
	return {
		id: raw.id,
		number: raw.number,
		modeId,
		preparedAt: raw.preparedAt,
		model: raw.model,
		sourceChecksum: raw.sourceChecksum,
		status
	};
}

export function parseDocumentCacheIndexV2(raw: unknown): DocumentCacheIndex | null {
	if (!isRecord(raw) || raw.version !== 2) {
		return null;
	}
	if (
		!isNonEmptyString(raw.sourcePath) ||
		!isNonEmptyString(raw.sourceChecksum) ||
		!isNonEmptyString(raw.updatedAt)
	) {
		return null;
	}
	const mode = raw.activeProcessingMode;
	if (mode !== 'sections' && mode !== 'single_story') {
		return null;
	}
	if (typeof raw.nextVersionNumber !== 'number' || raw.nextVersionNumber < 1) {
		return null;
	}
	if (!Array.isArray(raw.versions)) {
		return null;
	}
	const versions: PrepareVersionEntry[] = [];
	for (const item of raw.versions) {
		const entry = parsePrepareVersionEntry(item);
		if (!entry) {
			return null;
		}
		versions.push(entry);
	}
	const activeVersionId =
		raw.activeVersionId === null
			? null
			: isNonEmptyString(raw.activeVersionId)
				? raw.activeVersionId
				: null;
	if (raw.activeVersionId !== null && raw.activeVersionId !== undefined && activeVersionId === null) {
		return null;
	}
	return {
		version: 2,
		sourcePath: raw.sourcePath,
		sourceChecksum: raw.sourceChecksum,
		activeProcessingMode: mode,
		activeVersionId,
		nextVersionNumber: raw.nextVersionNumber,
		versions,
		updatedAt: raw.updatedAt
	};
}

/** Parses v2 index; returns null for v1 (migrate separately). */
export function parseDocumentCacheIndex(raw: unknown): DocumentCacheIndex | null {
	return parseDocumentCacheIndexV2(raw);
}

export function parseDocumentCacheIndexV1(raw: unknown): DocumentCacheIndexV1 | null {
	if (!isRecord(raw) || raw.version !== 1) {
		return null;
	}
	if (
		!isNonEmptyString(raw.sourcePath) ||
		!isNonEmptyString(raw.sourceChecksum) ||
		!isNonEmptyString(raw.updatedAt)
	) {
		return null;
	}
	const mode = raw.activeProcessingMode;
	if (mode !== 'sections' && mode !== 'single_story') {
		return null;
	}
	if (!isRecord(raw.modes)) {
		return null;
	}
	const sectionsEntry = parseModeCacheEntry(raw.modes.sections);
	const storyEntry = parseModeCacheEntry(raw.modes.single_story);
	if (!sectionsEntry || !storyEntry) {
		return null;
	}
	return {
		version: 1,
		sourcePath: raw.sourcePath,
		sourceChecksum: raw.sourceChecksum,
		activeProcessingMode: mode,
		modes: {
			sections: sectionsEntry,
			single_story: storyEntry
		},
		updatedAt: raw.updatedAt
	};
}

export function parseSectionsModeIndex(raw: unknown): SectionsModeIndex | null {
	if (!isRecord(raw) || raw.version !== 1) {
		return null;
	}
	if (
		!isNonEmptyString(raw.sourcePath) ||
		!isNonEmptyString(raw.sourceChecksum) ||
		!isNonEmptyString(raw.preparedAt) ||
		!isNonEmptyString(raw.model) ||
		(raw.prepareStrategy !== 'single' && raw.prepareStrategy !== 'batched')
	) {
		return null;
	}
	if (!Array.isArray(raw.sections)) {
		return null;
	}
	const sections: SectionsModeIndex['sections'] = [];
	for (const item of raw.sections) {
		if (!isRecord(item)) {
			return null;
		}
		if (
			!isNonEmptyString(item.id) ||
			!isNonEmptyString(item.title) ||
			typeof item.order !== 'number' ||
			(item.status !== 'ready' && item.status !== 'stale' && item.status !== 'error')
		) {
			return null;
		}
		sections.push({
			id: item.id,
			title: item.title,
			order: item.order,
			status: item.status
		});
	}
	return {
		version: 1,
		sourcePath: raw.sourcePath,
		sourceChecksum: raw.sourceChecksum,
		preparedAt: raw.preparedAt,
		prepareStrategy: raw.prepareStrategy,
		model: raw.model,
		sections
	};
}

export function parseSpeedReadSectionManifest(raw: unknown): SpeedReadSectionManifest | null {
	if (!isRecord(raw) || raw.version !== 1) {
		return null;
	}
	if (
		!isNonEmptyString(raw.sectionId) ||
		!isNonEmptyString(raw.sourcePath) ||
		!isNonEmptyString(raw.sourceChecksum) ||
		!isNonEmptyString(raw.title) ||
		!isNonEmptyString(raw.preparedAt) ||
		!isNonEmptyString(raw.model)
	) {
		return null;
	}
	const stream = parseStreamTokens(raw.stream);
	if (!stream || stream.length === 0) {
		return null;
	}
	return {
		version: 1,
		sectionId: raw.sectionId,
		sourcePath: raw.sourcePath,
		sourceChecksum: raw.sourceChecksum,
		title: raw.title,
		preparedAt: raw.preparedAt,
		model: raw.model,
		stream
	};
}

export function parseSingleStoryManifest(raw: unknown): SingleStoryManifest | null {
	if (!isRecord(raw) || raw.version !== 1) {
		return null;
	}
	if (
		!isNonEmptyString(raw.sourcePath) ||
		!isNonEmptyString(raw.sourceChecksum) ||
		!isNonEmptyString(raw.preparedAt) ||
		!isNonEmptyString(raw.model) ||
		(raw.prepareStrategy !== 'single' && raw.prepareStrategy !== 'batched')
	) {
		return null;
	}
	const stream = parseStreamTokens(raw.stream);
	if (!stream || stream.length === 0) {
		return null;
	}
	return {
		version: 1,
		sourcePath: raw.sourcePath,
		sourceChecksum: raw.sourceChecksum,
		preparedAt: raw.preparedAt,
		prepareStrategy: raw.prepareStrategy,
		model: raw.model,
		stream
	};
}
