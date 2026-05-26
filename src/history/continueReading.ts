import { TFile, type App } from 'obsidian';
import type { PluginServices } from '../services/serviceRegistry';
import type { BookPosition, NotePosition, ReadingState } from '../types/m2Contracts';

export interface ContinueReadingTarget {
	sourcePath: string;
	sourceKind: 'book' | 'note';
	state: ReadingState;
	initialPosition: BookPosition | NotePosition;
}

export interface ContinueReadingDeps {
	app: App;
	services: PluginServices;
}

export async function resolveContinueReadingTarget(
	deps: ContinueReadingDeps
): Promise<ContinueReadingTarget | null> {
	await deps.services.readingStateStore.reloadFromDisk();
	const file = await deps.services.readingStateStore.load();
	const sourcePath = file.lastGlobalSourcePath?.trim();
	if (!sourcePath) {
		return null;
	}

	const state = file.sources[sourcePath];
	if (!state || state.status !== 'in_progress') {
		return null;
	}

	const vaultFile = deps.app.vault.getAbstractFileByPath(sourcePath);
	if (!(vaultFile instanceof TFile)) {
		return null;
	}

	if (state.sourceKind === 'book' && vaultFile.extension !== 'epub') {
		return null;
	}
	if (state.sourceKind === 'note' && vaultFile.extension !== 'md') {
		return null;
	}

	return {
		sourcePath,
		sourceKind: state.sourceKind,
		state,
		initialPosition: state.position
	};
}

export async function continueReading(deps: ContinueReadingDeps): Promise<boolean> {
	const target = await resolveContinueReadingTarget(deps);
	if (!target) {
		return false;
	}

	await deps.services.readerGate.open({
		sourcePath: target.sourcePath,
		sourceKind: target.sourceKind,
		initialPosition: target.initialPosition,
		playbackMode: target.state.playbackMode
	});
	return true;
}
