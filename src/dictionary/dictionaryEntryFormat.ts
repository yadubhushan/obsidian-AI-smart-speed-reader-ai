import type { DictionaryResult } from './dictionaryTypes';

export const DICTIONARY_FILE_HEADER = '# Dictionary';

const WORD_HEADING_RE = /^###\s+(.+?)\s*$/;

function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function formatDictionaryEntry(result: DictionaryResult, date: Date): string {
	const lines: string[] = [`### ${result.word}`, ''];

	const phonetic = result.phonetic?.trim();
	if (phonetic) {
		lines.push(`**Pronunciation:** ${phonetic}`);
		lines.push('');
	}

	for (const meaning of result.meanings) {
		for (const definition of meaning.definitions) {
			lines.push(`- *${meaning.partOfSpeech}* — ${definition.text}`);
		}
	}

	lines.push('');
	lines.push(`Added: ${formatLocalDate(date)}`);
	return lines.join('\n');
}

export function dictionaryHasWord(content: string, word: string): boolean {
	const normalizedWord = word.trim().toLowerCase();
	if (!normalizedWord) {
		return false;
	}

	const lines = content.replace(/\r\n/g, '\n').split('\n');
	for (const line of lines) {
		const match = line.match(WORD_HEADING_RE);
		if (match && (match[1] ?? '').trim().toLowerCase() === normalizedWord) {
			return true;
		}
	}
	return false;
}

export function appendDictionaryEntry(content: string, block: string): string {
	const normalized = content.replace(/\r\n/g, '\n');
	if (normalized.trim().length === 0) {
		return `${DICTIONARY_FILE_HEADER}\n\n${block}`;
	}

	const prefix = normalized.endsWith('\n') ? normalized : `${normalized}\n`;
	return `${prefix}\n${block}`;
}
