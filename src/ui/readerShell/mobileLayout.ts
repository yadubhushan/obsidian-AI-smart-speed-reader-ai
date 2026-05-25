import { Platform } from 'obsidian';
import type { ReaderState } from '../../types';

export const MOBILE_GESTURE_HINT_KEY = 'speed-reader-ai-mobile-gesture-hint-shown';

export function isMobileReader(): boolean {
	return Platform.isDesktopApp === false;
}

export function applyMobileShellClass(shellEl: HTMLElement): void {
	shellEl.addClass('speed-reader-ai-mobile');
}

export function removeMobileShellClass(
	shellEl: HTMLElement,
	modalContainerEl?: HTMLElement | null
): void {
	shellEl.removeClass('speed-reader-ai-mobile');
	shellEl.removeClass('speed-reader-ai-mobile-playing');
	shellEl.removeClass('speed-reader-ai-mobile-paused');
	shellEl.removeClass('speed-reader-ai-mobile-menu-open');
	modalContainerEl?.removeClass('speed-reader-ai-mobile-playing');
}

export function syncMobilePlayingState(
	shellEl: HTMLElement,
	isPlaying: boolean,
	overlayOpen: boolean,
	modalContainerEl?: HTMLElement | null
): void {
	const immersive = isPlaying && !overlayOpen;
	shellEl.toggleClass('speed-reader-ai-mobile-playing', immersive);
	shellEl.toggleClass('speed-reader-ai-mobile-menu-open', overlayOpen);
	modalContainerEl?.toggleClass('speed-reader-ai-mobile-playing', immersive);
}

export function syncMobilePausedState(shellEl: HTMLElement, isPausedHome: boolean): void {
	shellEl.toggleClass('speed-reader-ai-mobile-paused', isPausedHome);
}

export function syncMobileProgressStrip(
	stripEl: HTMLElement | null,
	state: ReaderState | null,
	showProgress: boolean
): void {
	if (!stripEl) {
		return;
	}
	const fill = stripEl.querySelector('.speed-reader-ai-mobile-progress-fill') as HTMLElement | null;
	if (!state || !showProgress) {
		stripEl.addClass('is-hidden');
		if (fill) {
			fill.style.width = '0%';
		}
		return;
	}
	stripEl.removeClass('is-hidden');
	if (fill) {
		fill.style.width = `${Math.min(state.progress, 100)}%`;
	}
}

export function mountMobileProgressStrip(shellEl: HTMLElement): HTMLElement {
	const strip = shellEl.createDiv({ cls: 'speed-reader-ai-mobile-progress-strip is-hidden' });
	strip.createDiv({ cls: 'speed-reader-ai-mobile-progress-fill' });
	return strip;
}

/** Returns true the first time on this device (caller should show Notice). */
export function consumeMobileGestureHint(): boolean {
	try {
		if (localStorage.getItem(MOBILE_GESTURE_HINT_KEY) === '1') {
			return false;
		}
		localStorage.setItem(MOBILE_GESTURE_HINT_KEY, '1');
		return true;
	} catch {
		return false;
	}
}
