import type { App } from 'obsidian';
import {
	appendDictionaryEntry,
	dictionaryHasWord,
	formatDictionaryEntry
} from './dictionaryEntryFormat';
import type { DictionaryResult } from './dictionaryTypes';

export interface DictionarySaveResult {
	saved: boolean;
	path: string;
	reason?: 'duplicate';
}

export function normalizeDictionaryVaultPath(path: string): string {
	const trimmed = path.trim().replace(/^\/+/, '');
	return trimmed || 'dictionary.md';
}

export async function saveDictionaryEntry(
	app: App,
	vaultPath: string,
	result: DictionaryResult
): Promise<DictionarySaveResult> {
	const path = normalizeDictionaryVaultPath(vaultPath);
	const adapter = app.vault.adapter;

	const parentDir = path.replace(/\/[^/]+$/, '');
	if (parentDir && parentDir !== path) {
		await adapter.mkdir(parentDir).catch(() => undefined);
	}

	let existing = '';
	try {
		existing = await adapter.read(path);
	} catch {
		existing = '';
	}

	if (dictionaryHasWord(existing, result.word)) {
		return { saved: false, path, reason: 'duplicate' };
	}

	const block = formatDictionaryEntry(result, new Date());
	const next = appendDictionaryEntry(existing, block);
	await adapter.write(path, next);
	return { saved: true, path };
}
