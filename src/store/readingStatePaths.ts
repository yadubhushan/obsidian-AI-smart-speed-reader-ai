import { joinSpeedReaderVaultPath, speedReaderVaultRoot } from './speedReaderVaultPaths';

export function readingStateDataDir(): string {
	return speedReaderVaultRoot();
}

export function readingStateFilePath(): string {
	return joinSpeedReaderVaultPath('reading-state.json');
}
