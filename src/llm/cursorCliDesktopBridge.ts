import { Platform } from 'obsidian';

let canResolveCursorCliImpl: ((configuredPath: string | undefined) => boolean) | null =
	null;

/** Loads Cursor CLI module on desktop only; safe no-op on mobile. */
export async function initCursorCliDesktopSupport(): Promise<void> {
	if (!Platform.isDesktopApp || canResolveCursorCliImpl) {
		return;
	}
	const { detectCursorExecutable } = await import('./CursorCliClient');
	canResolveCursorCliImpl = (configuredPath) => {
		try {
			detectCursorExecutable(configuredPath);
			return true;
		} catch {
			return false;
		}
	};
}

export function canResolveCursorCliDesktop(
	configuredPath: string | undefined
): boolean {
	if (!Platform.isDesktopApp) {
		return false;
	}
	return canResolveCursorCliImpl?.(configuredPath) ?? false;
}
