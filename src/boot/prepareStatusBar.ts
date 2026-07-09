import { MarkdownView, Plugin } from 'obsidian';
import { activeVersionStatus } from '../store/cacheIndexUtils';
import type { ManifestStore } from '../store/ManifestStore';

/**
 * Owns the "AI Ready / AI Stale" status bar item: element lifecycle,
 * workspace event subscriptions, and render state.
 */
export class PrepareStatusBar {
	private el: HTMLElement | null = null;

	constructor(
		private readonly plugin: Plugin,
		private readonly getManifestStore: () => ManifestStore
	) {}

	attach(): void {
		this.el = this.plugin.addStatusBarItem();
		this.el.addClass('speed-reader-ai-statusbar');
		this.el.addClass('is-hidden');
		void this.refresh();

		this.plugin.registerEvent(
			this.plugin.app.workspace.on('active-leaf-change', () => {
				void this.refresh();
			})
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('file-open', () => {
				void this.refresh();
			})
		);
	}

	detach(): void {
		this.el = null;
	}

	async refresh(): Promise<void> {
		const el = this.el;
		if (!el) return;

		el.removeClass('is-ready', 'is-stale', 'is-hidden');
		el.empty();

		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		if (!file || file.extension !== 'md') {
			el.addClass('is-hidden');
			return;
		}

		const store = this.getManifestStore();
		const index = await store.getDocumentIndex(file.path);
		if (!index) {
			el.addClass('is-hidden');
			return;
		}

		const modeStatus = activeVersionStatus(index);

		if (modeStatus === 'ready') {
			el.addClass('is-ready');
			el.setText('⚡ AI Ready');
			return;
		}

		if (modeStatus === 'stale') {
			el.addClass('is-stale');
			el.setText('⚠ AI Stale');
			return;
		}

		el.addClass('is-hidden');
	}
}
