import { Notice, Modal, type App } from 'obsidian';
import type { ManifestStore } from '../store/ManifestStore';
import type { PluginServices } from '../services/serviceRegistry';
import { renderLandingShell, type LandingShellHandle } from './landing/landingShell';

export interface ReadingHistoryModalDeps {
	app: App;
	services: PluginServices;
	getManifestStore: () => ManifestStore;
}

export class ReadingHistoryModal extends Modal {
	private shell: LandingShellHandle | null = null;

	constructor(
		app: App,
		private readonly deps: ReadingHistoryModalDeps
	) {
		super(app);
	}

	onOpen(): void {
		void this.openWithFreshState();
	}

	private async openWithFreshState(): Promise<void> {
		await this.deps.services.readingStateStore.reloadFromDisk();

		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass('speed-reader-history-modal', 'speed-reader-landing-modal');

		this.shell = renderLandingShell(contentEl, {
			app: this.app,
			services: this.deps.services,
			getManifestStore: this.deps.getManifestStore,
			onContinueSuccess: () => this.close()
		});

		await this.shell.refresh();
	}

	onClose(): void {
		this.shell?.destroy();
		this.shell = null;
		this.contentEl.empty();
	}
}

export function openReadingHistoryModal(deps: ReadingHistoryModalDeps): void {
	new ReadingHistoryModal(deps.app, deps).open();
}
