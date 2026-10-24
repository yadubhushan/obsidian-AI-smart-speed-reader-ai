import type { ModeCacheStatus } from '../../types/processedDocument';

export type DesktopReaderChromeMode = 'setup' | 'paused' | 'playing' | 'transition';

export interface DesktopChromeStateInput {
	setupRequested: boolean;
	setupRequired: boolean;
	isPlaying: boolean;
	finished: boolean;
	transitionVisible: boolean;
}

export function deriveDesktopChromeMode(
	input: DesktopChromeStateInput
): DesktopReaderChromeMode {
	if (input.transitionVisible) {
		return 'transition';
	}
	if (input.setupRequested || input.setupRequired) {
		return 'setup';
	}
	if (input.isPlaying && !input.finished) {
		return 'playing';
	}
	return 'paused';
}

export interface InitialReadingSetupInput {
	isStructured: boolean;
	hasResumePosition: boolean;
	activeVersionStatus: ModeCacheStatus | 'none';
	hasPreferredAiVersion: boolean;
}

/**
 * The setup gate is intentionally conservative: known resumable or ready
 * sessions open immediately, while first-time and invalid AI sessions explain
 * the local/AI choice before reading starts.
 */
export function shouldShowInitialReadingSetup(
	input: InitialReadingSetupInput
): boolean {
	if (!input.isStructured) {
		return false;
	}
	if (input.activeVersionStatus === 'stale' || input.activeVersionStatus === 'error') {
		return true;
	}
	if (input.hasPreferredAiVersion && input.activeVersionStatus !== 'ready') {
		return true;
	}
	if (input.hasResumePosition || input.activeVersionStatus === 'ready') {
		return false;
	}
	return true;
}

