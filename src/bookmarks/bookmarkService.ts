import { Notice, type App } from 'obsidian';
import { noteContentChecksum } from '../crypto-checksum';
import type { PlaybackLoadKind } from '../ui/structuredReaderSession';
import type { RSVPEngine } from '../engine/rsvpEngine';
import { bookPositionToEngineIndices } from '../formats/bookIndexToProcessedDocument';
import {
	applyNoteResumePosition,
	bookPositionFromEngine,
	notePositionFromEngine
} from '../reader/readingProgress';
import type { BookCacheIndex, BookPosition, NotePosition } from '../types/m2Contracts';
import type { ReaderState, SpeedReaderAiSettings } from '../types';
import type { SpeedReaderOpen } from '../ui/speedReaderOpen';
import type { StructuredReaderSession } from '../ui/structuredReaderSession';
import {
	formatBookBookmarkUri,
	formatBookmarkBlock,
	formatNoteBookmarkUri,
	formatPassageWithHighlight
} from './bookmarkBlock';
import { appendNoteBookmark } from './noteBookmarkAppend';
import { resolveBookBookmarkPath } from './bookmarkPaths';
import {
	parseBookmarkEntries,
	parseNoteBookmarkSection,
	type BookmarkEntry
} from './parseBookmarkEntries';
import {
	parseBookmarkPositionLine,
	parseBookmarkResumeUri
} from './parseBookmarkResume';

export interface BookmarkReaderContext {
	readerOpen: SpeedReaderOpen;
	engine: RSVPEngine;
	readerState: ReaderState | null;
	sourcePath: string | null;
	bookIndex?: BookCacheIndex;
	session?: StructuredReaderSession | null;
	onNoteReloaded?: (kind: PlaybackLoadKind) => void;
}

export interface BookmarkServiceDeps {
	app: App;
	getSettings: () => SpeedReaderAiSettings;
}

export class BookmarkService {
	constructor(private readonly deps: BookmarkServiceDeps) {}

	async createBookmark(ctx: BookmarkReaderContext): Promise<void> {
		if (ctx.readerOpen.kind === 'legacy') {
			new Notice('Bookmarks are not available for this reader mode.');
			return;
		}

		if (ctx.readerOpen.kind === 'book') {
			await this.createBookBookmark(ctx);
			return;
		}

		if (ctx.readerOpen.kind === 'structured') {
			await this.createNoteBookmark(ctx);
			return;
		}
	}

	async loadBookmarkEntries(ctx: BookmarkReaderContext): Promise<BookmarkEntry[]> {
		if (ctx.readerOpen.kind === 'legacy') {
			return [];
		}

		if (ctx.readerOpen.kind === 'book') {
			const path = resolveBookBookmarkPath(this.deps.getSettings(), ctx.readerOpen.sourcePath);
			try {
				const markdown = await this.deps.app.vault.adapter.read(path);
				return parseBookmarkEntries(markdown);
			} catch {
				return [];
			}
		}

		if (ctx.readerOpen.kind === 'structured') {
			const file = this.deps.app.vault.getFileByPath(ctx.readerOpen.sourcePath);
			if (!file) {
				return [];
			}
			const markdown = await this.deps.app.vault.read(file);
			return parseNoteBookmarkSection(
				markdown,
				this.deps.getSettings().bookmarks.noteBookmarkSectionHeading
			);
		}

		return [];
	}

	async openBookmarkMarkdownInObsidian(ctx: BookmarkReaderContext): Promise<void> {
		if (ctx.readerOpen.kind === 'legacy') {
			new Notice('Bookmarks are not available for this reader mode.');
			return;
		}

		if (ctx.readerOpen.kind === 'book') {
			const path = resolveBookBookmarkPath(this.deps.getSettings(), ctx.readerOpen.sourcePath);
			await this.deps.app.workspace.openLinkText(path, '', true);
			return;
		}

		if (ctx.readerOpen.kind === 'structured') {
			await this.deps.app.workspace.openLinkText(ctx.readerOpen.sourcePath, '', true);
		}
	}

	seekToBookmarkEntry(ctx: BookmarkReaderContext, entry: BookmarkEntry): boolean {
		if (ctx.readerOpen.kind === 'legacy') {
			return false;
		}

		const engine = ctx.engine;
		const sourcePath = ctx.sourcePath;

		if (entry.resumeUri) {
			const target = parseBookmarkResumeUri(entry.resumeUri);
			if (target && target.sourcePath === sourcePath) {
				if (target.kind === 'book' && ctx.readerOpen.kind === 'book') {
					const { sectionIndex, tokenIndex } = bookPositionToEngineIndices(
						ctx.readerOpen.bookIndex,
						target.position
					);
					engine.goToSection(sectionIndex);
					engine.seekToToken(tokenIndex);
					return true;
				}
				if (target.kind === 'note' && ctx.readerOpen.kind === 'structured') {
					const processed = engine.getLoadedProcessedDocument();
					if (processed) {
						applyNoteResumePosition(engine, processed, target.position);
						return true;
					}
				}
			}
		}

		if (ctx.readerOpen.kind === 'book') {
			const position = parseBookmarkPositionLine(entry.positionLine, 'book');
			if (position && 'chapterId' in position) {
				const { sectionIndex, tokenIndex } = bookPositionToEngineIndices(
					ctx.readerOpen.bookIndex,
					position
				);
				engine.goToSection(sectionIndex);
				engine.seekToToken(tokenIndex);
				return true;
			}
		}

		if (ctx.readerOpen.kind === 'structured') {
			const position = parseBookmarkPositionLine(entry.positionLine, 'note');
			const processed = engine.getLoadedProcessedDocument();
			if (position && 'sectionId' in position && processed) {
				applyNoteResumePosition(engine, processed, position);
				return true;
			}
		}

		return false;
	}

	private buildPassage(engine: RSVPEngine): string {
		const passage = engine.getBookmarkPassage();
		const formatted = formatPassageWithHighlight(passage);
		if (formatted && formatted !== '(no passage captured)') {
			return formatted;
		}
		const context = engine.getContext(12);
		const parts = [...context.before, ...context.after].filter(Boolean);
		return parts.join(' ').trim();
	}

	private async createBookBookmark(ctx: BookmarkReaderContext): Promise<void> {
		const { readerOpen, engine } = ctx;
		if (readerOpen.kind !== 'book') {
			return;
		}

		const settings = this.deps.getSettings();
		const vaultPath = resolveBookBookmarkPath(settings, readerOpen.sourcePath);
		const adapter = this.deps.app.vault.adapter;
		const parentDir = vaultPath.replace(/\/[^/]+$/, '');
		if (parentDir && parentDir !== vaultPath) {
			await adapter.mkdir(parentDir).catch(() => undefined);
		}

		const position = this.resolveBookPosition(readerOpen.bookIndex, engine, ctx.readerState);
		const sectionTitle =
			engine.getSectionList().find((s) => s.id === position.chapterId)?.title ??
			ctx.readerState?.sectionTitle;
		const block = formatBookmarkBlock({
			timestamp: new Date(),
			sectionTitle,
			passage: this.buildPassage(engine),
			positionLine: `chapter ${position.chapterId} word ${position.wordIndex}`,
			uriLine: formatBookBookmarkUri(
				readerOpen.sourcePath,
				position.chapterId,
				position.wordIndex
			)
		});

		let existing = '';
		try {
			existing = await adapter.read(vaultPath);
		} catch {
			existing = '';
		}

		const next = existing.length > 0 ? `${existing.replace(/\r\n/g, '\n')}\n\n${block}` : `${block}`;
		await adapter.write(vaultPath, next);
		new Notice(`Bookmark saved to ${vaultPath}`);
	}

	private async createNoteBookmark(ctx: BookmarkReaderContext): Promise<void> {
		const { readerOpen, engine, session } = ctx;
		if (readerOpen.kind !== 'structured') {
			return;
		}

		const settings = this.deps.getSettings();
		const file = this.deps.app.vault.getFileByPath(readerOpen.sourcePath);
		if (!file) {
			new Notice('Source note not found.');
			return;
		}

		const position = this.resolveNotePosition(engine, ctx.readerState);
		const sectionTitle = ctx.readerState?.sectionTitle;
		const block = formatBookmarkBlock({
			timestamp: new Date(),
			sectionTitle,
			passage: this.buildPassage(engine),
			positionLine: `section ${position.sectionId} word ${position.wordIndex}`,
			uriLine: formatNoteBookmarkUri(
				readerOpen.sourcePath,
				position.sectionId,
				position.wordIndex
			)
		});

		const content = await this.deps.app.vault.read(file);
		const next = appendNoteBookmark(
			content,
			settings.bookmarks.noteBookmarkSectionHeading,
			block
		);
		await this.deps.app.vault.modify(file, next);

		const checksum = await noteContentChecksum(
			next,
			settings.bookmarks.noteBookmarkSectionHeading
		);
		if (session) {
			const kind = await session.reloadFromVaultText(next, checksum, engine, {
				sectionIndex: ctx.readerState?.currentSectionIndex,
				tokenIndex: ctx.readerState?.currentTokenIndex
			});
			ctx.onNoteReloaded?.(kind);
		}

		new Notice('Bookmark added to note.');
	}

	private resolveBookPosition(
		index: BookCacheIndex,
		engine: RSVPEngine,
		state: ReaderState | null
	): BookPosition {
		const sections = engine.getSectionList();
		const sectionId = sections[state?.currentSectionIndex ?? 0]?.id;
		const tokenIndex = state?.currentTokenIndex ?? state?.currentIndex ?? 0;
		return bookPositionFromEngine(index, sectionId, tokenIndex);
	}

	private resolveNotePosition(engine: RSVPEngine, state: ReaderState | null): NotePosition {
		const processed = engine.getLoadedProcessedDocument();
		const sections = engine.getSectionList();
		const sectionId = sections[state?.currentSectionIndex ?? 0]?.id;
		const tokenIndex = state?.currentTokenIndex ?? state?.currentIndex ?? 0;

		if (processed) {
			return notePositionFromEngine(processed, sectionId, tokenIndex);
		}

		return { sectionId: sectionId ?? 'section-01', wordIndex: tokenIndex };
	}
}

export function createBookmarkService(deps: BookmarkServiceDeps): BookmarkService {
	return new BookmarkService(deps);
}
