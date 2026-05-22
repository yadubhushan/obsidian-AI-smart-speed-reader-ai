import type {
	DocumentCacheIndex,
	ModeCacheStatus,
	PrepareVersionEntry,
	ProcessingModeId
} from '../types/processedDocument';

export function versionIdFromNumber(n: number): string {
	return `v${n}`;
}

export function versionNumberFromId(id: string): number {
	const match = /^v(\d+)$/.exec(id);
	return match ? Number.parseInt(match[1] ?? '0', 10) : 0;
}

export function sortVersionsNewestFirst(versions: PrepareVersionEntry[]): PrepareVersionEntry[] {
	return [...versions].sort((a, b) => b.number - a.number);
}

export function getVersionById(
	index: DocumentCacheIndex,
	versionId: string
): PrepareVersionEntry | undefined {
	return index.versions.find((v) => v.id === versionId);
}

export function activeVersionEntry(index: DocumentCacheIndex): PrepareVersionEntry | null {
	if (!index.activeVersionId) {
		return null;
	}
	return getVersionById(index, index.activeVersionId) ?? null;
}

export function latestReadyVersion(
	index: DocumentCacheIndex,
	readableChecksum?: string
): PrepareVersionEntry | null {
	const sorted = sortVersionsNewestFirst(index.versions);
	for (const entry of sorted) {
		if (entry.status !== 'ready') {
			continue;
		}
		if (readableChecksum !== undefined && entry.sourceChecksum !== readableChecksum) {
			continue;
		}
		return entry;
	}
	return null;
}

export function latestVersion(index: DocumentCacheIndex): PrepareVersionEntry | null {
	return sortVersionsNewestFirst(index.versions)[0] ?? null;
}

export function resolveDefaultActiveVersionId(
	index: DocumentCacheIndex,
	readableChecksum: string,
	preferredVersionId?: string | null
): string | null {
	if (preferredVersionId) {
		const preferred = getVersionById(index, preferredVersionId);
		if (preferred && preferred.status === 'ready' && preferred.sourceChecksum === readableChecksum) {
			return preferredVersionId;
		}
	}
	const current = activeVersionEntry(index);
	if (current && current.status === 'ready' && current.sourceChecksum === readableChecksum) {
		return index.activeVersionId;
	}
	const ready = latestReadyVersion(index, readableChecksum);
	if (ready) {
		return ready.id;
	}
	const anyLatest = latestVersion(index);
	return anyLatest?.id ?? null;
}

export function activeVersionStatus(index: DocumentCacheIndex | null): ModeCacheStatus | 'none' {
	if (!index) {
		return 'none';
	}
	const active = activeVersionEntry(index);
	return active?.status ?? 'none';
}

export function isVersionReady(index: DocumentCacheIndex | null, versionId: string | null): boolean {
	if (!index || !versionId) {
		return false;
	}
	return getVersionById(index, versionId)?.status === 'ready';
}

export function noteHasReadyVersion(index: DocumentCacheIndex | null): boolean {
	if (!index) {
		return false;
	}
	return index.versions.some((v) => v.status === 'ready');
}
