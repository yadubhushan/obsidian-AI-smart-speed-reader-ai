import { setIcon } from 'obsidian';
import type { ReaderState } from '../../types';

export const PLAYING_HUD_HIDE_DELAY_MS = 1800;

export interface PlayingHudVisibilityController {
	reveal(): void;
	hide(): void;
	destroy(): void;
}

export function createPlayingHudVisibilityController(deps: {
	setRevealed(revealed: boolean): void;
	schedule(cb: () => void, ms: number): number;
	clear(timer: number): void;
	hideDelayMs?: number;
}): PlayingHudVisibilityController {
	let timer: number | null = null;
	const clearTimer = () => {
		if (timer !== null) {
			deps.clear(timer);
			timer = null;
		}
	};
	return {
		reveal() {
			clearTimer();
			deps.setRevealed(true);
			timer = deps.schedule(() => {
				timer = null;
				deps.setRevealed(false);
			}, deps.hideDelayMs ?? PLAYING_HUD_HIDE_DELAY_MS);
		},
		hide() {
			clearTimer();
			deps.setRevealed(false);
		},
		destroy() {
			clearTimer();
		}
	};
}

export function isEligibleCanvasPauseTarget(
	target: EventTarget | null,
	wordContainer: HTMLElement,
	selectionText: string
): boolean {
	if (selectionText.trim().length > 0 || !(target instanceof HTMLElement)) {
		return false;
	}
	if (target.closest('button, select, input, a, [role="button"], .speed-reader-ai-context-word')) {
		return false;
	}
	return target === wordContainer || target.classList.contains('speed-reader-ai-word-display');
}

export interface DesktopPlayingHudHandle {
	destroy(): void;
	setVisible(visible: boolean): void;
	update(state: ReaderState | null, documentProgressPercent: number | null): void;
}

export function mountDesktopPlayingHud(
	container: HTMLElement,
	onPause: () => void
): DesktopPlayingHudHandle {
	const root = container.createDiv({ cls: 'speed-reader-ai-playing-hud is-hidden' });
	const top = root.createDiv({ cls: 'speed-reader-ai-playing-hud-top' });
	const section = top.createSpan({ cls: 'speed-reader-ai-playing-hud-section' });
	const progressTrack = top.createDiv({ cls: 'speed-reader-ai-playing-hud-progress' });
	const progressFill = progressTrack.createDiv({ cls: 'speed-reader-ai-playing-hud-progress-fill' });

	const hotZone = root.createDiv({
		cls: 'speed-reader-ai-playing-hud-hot-zone',
		attr: { 'aria-label': 'Playback controls' }
	});
	const controls = hotZone.createDiv({ cls: 'speed-reader-ai-playing-hud-controls' });
	const pauseButton = controls.createEl('button', {
		cls: 'speed-reader-ai-playing-hud-pause',
		attr: { type: 'button', 'aria-label': 'Pause', title: 'Pause' }
	});
	setIcon(pauseButton, 'pause');
	const wpm = controls.createSpan({ cls: 'speed-reader-ai-playing-hud-wpm' });
	const percentage = controls.createSpan({ cls: 'speed-reader-ai-playing-hud-percentage' });

	const visibility = createPlayingHudVisibilityController({
		setRevealed: (revealed) => hotZone.toggleClass('is-revealed', revealed),
		schedule: (cb, ms) => window.setTimeout(cb, ms),
		clear: (timer) => window.clearTimeout(timer)
	});
	hotZone.addEventListener('pointerenter', () => visibility.reveal());
	hotZone.addEventListener('pointermove', () => visibility.reveal());
	pauseButton.addEventListener('click', onPause);

	return {
		destroy() {
			visibility.destroy();
			root.remove();
		},
		setVisible(visible) {
			root.toggleClass('is-hidden', !visible);
			if (!visible) {
				visibility.hide();
			}
		},
		update(state, documentProgressPercent) {
			const title = state?.sectionTitle?.trim() || state?.currentHeading?.text || 'Reading';
			section.setText(title);
			const progress = Math.min(100, Math.max(0, documentProgressPercent ?? state?.progress ?? 0));
			progressFill.style.width = `${progress}%`;
			wpm.setText(`${Math.round(state?.currentWpm ?? 0)} WPM`);
			percentage.setText(`${Math.round(progress)}%`);
		}
	};
}
