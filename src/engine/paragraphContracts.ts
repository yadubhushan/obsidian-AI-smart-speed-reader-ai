import type { PauseContextToken } from './readingNavigation';

export interface BookmarkPassage {
	paragraphText: string;
	highlightedSentence: string;
}

export interface PauseSentenceContext {
	/** Optional muted paragraph prefix outside current sentence. */
	paragraphPrefix?: string;
	/** Optional muted paragraph suffix outside current sentence. */
	paragraphSuffix?: string;
	sentenceTokens: PauseContextToken[];
}

export interface PauseLineContextLine {
	isCurrentLine: boolean;
	tokens: PauseContextToken[];
}

export interface PauseLineContext {
	lines: PauseLineContextLine[];
}
