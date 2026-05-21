import type { App, Plugin, TAbstractFile, TFile } from 'obsidian';
import type { EventBus } from '../services/eventBus';
import type { EpubVaultEntry, EpubVaultIndex } from '../types/m2Contracts';

const RENAME_DEBOUNCE_MS = 300;

function isEpubVaultFile(file: TAbstractFile): file is TFile {
	return 'extension' in file && file.extension === 'epub';
}

function buildEntry(file: TFile): EpubVaultEntry {
	const sourcePath = file.path;
	const parts = sourcePath.replace(/\\/g, '/').split('/');
	const basename = parts[parts.length - 1] ?? sourcePath;
	const title = basename.replace(/\.epub$/i, '');
	const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
	return { sourcePath, title, folder };
}

function isEpubPath(path: string): boolean {
	return path.toLowerCase().endsWith('.epub');
}

export class EpubVaultIndexImpl implements EpubVaultIndex {
	private entries = new Map<string, EpubVaultEntry>();
	private listeners = new Set<() => void>();
	private renameTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly app: App,
		private readonly eventBus: EventBus
	) {
		this.rebuildIndex(false);
	}

	getAll(): EpubVaultEntry[] {
		return Array.from(this.entries.values()).sort((a, b) =>
			a.sourcePath.localeCompare(b.sourcePath)
		);
	}

	get(sourcePath: string): EpubVaultEntry | undefined {
		return this.entries.get(sourcePath);
	}

	refresh(): void {
		this.rebuildIndex(true);
	}

	registerVaultListeners(plugin: Plugin): void {
		plugin.registerEvent(
			this.app.vault.on('create', (file) => {
				if (isEpubVaultFile(file)) {
					this.rebuildIndex(true);
				}
			})
		);
		plugin.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (isEpubVaultFile(file)) {
					this.rebuildIndex(true);
				}
			})
		);
		plugin.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (isEpubVaultFile(file) || isEpubPath(oldPath)) {
					this.scheduleRebuild();
				}
			})
		);
	}

	onChanged(callback: () => void): () => void {
		this.listeners.add(callback);
		return () => {
			this.listeners.delete(callback);
		};
	}

	private scheduleRebuild(): void {
		if (this.renameTimer !== null) {
			clearTimeout(this.renameTimer);
		}
		this.renameTimer = setTimeout(() => {
			this.renameTimer = null;
			this.rebuildIndex(true);
		}, RENAME_DEBOUNCE_MS);
	}

	private rebuildIndex(notify: boolean): void {
		const next = new Map<string, EpubVaultEntry>();
		for (const file of this.app.vault.getFiles()) {
			if (file.extension !== 'epub') {
				continue;
			}
			const entry = buildEntry(file);
			next.set(entry.sourcePath, entry);
		}

		const changed =
			next.size !== this.entries.size ||
			[...next.keys()].some((key) => !this.entries.has(key)) ||
			[...this.entries.keys()].some((key) => !next.has(key));

		this.entries = next;
		if (notify && changed) {
			this.notifyChanged();
		}
	}

	private notifyChanged(): void {
		this.eventBus.emit('epub-index-changed', {});
		for (const listener of this.listeners) {
			listener();
		}
	}
}

export function createEpubVaultIndex(app: App, eventBus: EventBus): EpubVaultIndexImpl {
	return new EpubVaultIndexImpl(app, eventBus);
}
