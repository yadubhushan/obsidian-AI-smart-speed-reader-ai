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
	formatPassageWithHighlight,
	formatPassageWithHighlights,
	serializeBookmarkEntry
} from './bookmarkBlock';
import {
	groupSelectionsByParagraph,
	lineMatchesBookmarkEntry,
	removeLineFromBookmarkEntry,
	type BookmarkContextLine
} from './bookmarkContextLines';
import { appendNoteBookmark, findBookmarkSectionLineIndex } from './noteBookmarkAppend';
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

	async createBookmarksFromSelection(
		ctx: BookmarkReaderContext,
		selectedLineIndices: number[],
		lines: BookmarkContextLine[]
	): Promise<void> {
		if (ctx.readerOpen.kind === 'legacy') {
			new Notice('Bookmarks are not available for this reader mode.');
			return;
		}

		if (selectedLineIndices.length === 0 || lines.length === 0) {
			return;
		}

		const groups = groupSelectionsByParagraph(lines, selectedLineIndices);
		if (groups.size === 0) {
			return;
		}

		const engine = ctx.engine;
		let savedCount = 0;

		for (const [, groupLines] of [...groups.entries()].sort(
			(left, right) => left[0] - right[0]
		)) {
			const firstLine = groupLines[0];
			if (!firstLine) {
				continue;
			}

			const paragraphText = engine.getParagraphTextForParagraphIndex(firstLine.paragraphIndex);
			const passage = formatPassageWithHighlights(
				paragraphText,
				groupLines.map((line) => line.text)
			);

			if (ctx.readerOpen.kind === 'book') {
				await this.appendBookBookmark(ctx, passage, firstLine.startSeekIndex);
			} else if (ctx.readerOpen.kind === 'structured') {
				await this.appendNoteBookmark(ctx, passage, firstLine.startSeekIndex);
			}
			savedCount += 1;
		}

		if (savedCount === 1) {
			new Notice('Bookmark saved.');
		} else if (savedCount > 1) {
			new Notice(`${savedCount} bookmarks saved.`);
		}
	}

	async removeBookmarkForLine(
		ctx: BookmarkReaderContext,
		lineIndex: number,
		lines: BookmarkContextLine[]
	): Promise<boolean> {
		if (ctx.readerOpen.kind === 'legacy') {
			new Notice('Bookmarks are not available for this reader mode.');
			return false;
		}

		const line = lines.find((entry) => entry.lineIndex === lineIndex);
		if (!line) {
			return false;
		}

		if (ctx.readerOpen.kind === 'book') {
			return this.removeBookBookmarkForLine(ctx, line);
		}

		if (ctx.readerOpen.kind === 'structured') {
			return this.removeNoteBookmarkForLine(ctx, line);
		}

		return false;
	}

	private rebuildBookBookmarkMarkdown(entries: BookmarkEntry[]): string {
		return entries.map((entry) => serializeBookmarkEntry(entry)).join('\n').trimEnd();
	}

	private replaceNoteBookmarkSectionEntries(
		content: string,
		heading: string,
		entries: BookmarkEntry[]
	): string {
		const normalized = content.replace(/\r\n/g, '\n');
		const sectionIndex = findBookmarkSectionLineIndex(normalized, heading);
		if (sectionIndex < 0) {
			return normalized;
		}

		const lines = normalized.split('\n');
		const before = lines.slice(0, sectionIndex + 1).join('\n');
		const rest = lines.slice(sectionIndex + 1).join('\n');
		const nextH1 = rest.search(/^#\s+/m);
		const afterSection = nextH1 >= 0 ? rest.slice(nextH1) : '';
		const sectionBody = entries.map((entry) => serializeBookmarkEntry(entry)).join('\n').trimEnd();
		const middle = sectionBody.length > 0 ? `\n\n${sectionBody}\n` : '\n';
		const suffix = afterSection.length > 0 ? `\n${afterSection}` : '';
		return `${before}${middle}${suffix}`.replace(/\n{3,}/g, '\n\n');
	}

	private applyLineRemovalToEntries(
		entries: BookmarkEntry[],
		line: BookmarkContextLine,
		kind: 'book' | 'note'
	): { entries: BookmarkEntry[]; changed: boolean } {
		const nextEntries: BookmarkEntry[] = [];
		let changed = false;

		for (const entry of entries) {
			if (!lineMatchesBookmarkEntry(line, entry, kind)) {
				nextEntries.push(entry);
				continue;
			}

			changed = true;
			const updated = removeLineFromBookmarkEntry(entry, line, kind);
			if (updated) {
				nextEntries.push(updated);
			}
		}

		return { entries: nextEntries, changed };
	}

	private async removeBookBookmarkForLine(
		ctx: BookmarkReaderContext,
		line: BookmarkContextLine
	): Promise<boolean> {
		if (ctx.readerOpen.kind !== 'book') {
			return false;
		}

		const settings = this.deps.getSettings();
		const vaultPath = resolveBookBookmarkPath(settings, ctx.readerOpen.sourcePath);
		const adapter = this.deps.app.vault.adapter;
		let markdown = '';
		try {
			markdown = await adapter.read(vaultPath);
		} catch {
			return false;
		}

		const entries = parseBookmarkEntries(markdown);
		const { entries: nextEntries, changed } = this.applyLineRemovalToEntries(entries, line, 'book');
		if (!changed) {
			return false;
		}

		await adapter.write(vaultPath, this.rebuildBookBookmarkMarkdown(nextEntries));
		new Notice('Bookmark removed.');
		return true;
	}

	private async removeNoteBookmarkForLine(
		ctx: BookmarkReaderContext,
		line: BookmarkContextLine
	): Promise<boolean> {
		if (ctx.readerOpen.kind !== 'structured') {
			return false;
		}

		const settings = this.deps.getSettings();
		const heading = settings.bookmarks.noteBookmarkSectionHeading;
		const file = this.deps.app.vault.getFileByPath(ctx.readerOpen.sourcePath);
		if (!file) {
			new Notice('Source note not found.');
			return false;
		}

		const content = await this.deps.app.vault.read(file);
		const entries = parseNoteBookmarkSection(content, heading);
		const { entries: nextEntries, changed } = this.applyLineRemovalToEntries(entries, line, 'note');
		if (!changed) {
			return false;
		}

		const next = this.replaceNoteBookmarkSectionEntries(content, heading, nextEntries);
		await this.deps.app.vault.modify(file, next);

		const checksum = await noteContentChecksum(next, heading);
		if (ctx.session) {
			const kind = await ctx.session.reloadFromVaultText(next, checksum, ctx.engine, {
				sectionIndex: ctx.readerState?.currentSectionIndex,
				tokenIndex: ctx.readerState?.currentTokenIndex
			});
			ctx.onNoteReloaded?.(kind);
		}

		new Notice('Bookmark removed.');
		return true;
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

		const position = this.resolveBookPosition(readerOpen.bookIndex, engine, ctx.readerState);
		await this.appendBookBookmark(ctx, this.buildPassage(engine), position.wordIndex);
		const vaultPath = resolveBookBookmarkPath(this.deps.getSettings(), readerOpen.sourcePath);
		new Notice(`Bookmark saved to ${vaultPath}`);
	}

	private async appendBookBookmark(
		ctx: BookmarkReaderContext,
		passage: string,
		seekIndex: number
	): Promise<void> {
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

		const position = this.resolveBookPositionFromSeekIndex(
			readerOpen.bookIndex,
			engine,
			ctx.readerState,
			seekIndex
		);
		const sectionTitle =
			engine.getSectionList().find((section) => section.id === position.chapterId)?.title ??
			ctx.readerState?.sectionTitle;
		const block = formatBookmarkBlock({
			timestamp: new Date(),
			sectionTitle,
			passage,
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
	}

	private async createNoteBookmark(ctx: BookmarkReaderContext): Promise<void> {
		const { readerOpen, engine } = ctx;
		if (readerOpen.kind !== 'structured') {
			return;
		}

		const tokenIndex = ctx.readerState?.currentTokenIndex ?? ctx.readerState?.currentIndex ?? 0;
		await this.appendNoteBookmark(ctx, this.buildPassage(engine), tokenIndex);
		new Notice('Bookmark added to note.');
	}

	private async appendNoteBookmark(
		ctx: BookmarkReaderContext,
		passage: string,
		seekIndex: number
	): Promise<void> {
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

		const position = this.resolveNotePositionFromSeekIndex(engine, ctx.readerState, seekIndex);
		const sectionTitle = ctx.readerState?.sectionTitle;
		const block = formatBookmarkBlock({
			timestamp: new Date(),
			sectionTitle,
			passage,
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

	private resolveBookPositionFromSeekIndex(
		index: BookCacheIndex,
		engine: RSVPEngine,
		state: ReaderState | null,
		seekIndex: number
	): BookPosition {
		const sections = engine.getSectionList();
		const sectionId = sections[state?.currentSectionIndex ?? 0]?.id;
		return bookPositionFromEngine(index, sectionId, seekIndex);
	}

	private resolveNotePositionFromSeekIndex(
		engine: RSVPEngine,
		state: ReaderState | null,
		seekIndex: number
	): NotePosition {
		const processed = engine.getLoadedProcessedDocument();
		const sections = engine.getSectionList();
		const sectionId = sections[state?.currentSectionIndex ?? 0]?.id;

		if (processed) {
			return notePositionFromEngine(processed, sectionId, seekIndex);
		}

		return { sectionId: sectionId ?? 'section-01', wordIndex: seekIndex };
	}
}

export function createBookmarkService(deps: BookmarkServiceDeps): BookmarkService {
	return new BookmarkService(deps);
}
