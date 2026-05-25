import {
	PLAYBACK_MODE_ORDER,
	getPlaybackModeLabel,
	isLinePlaybackMode
} from '../../engine/playbackMode';
import type { PlaybackMode } from '../../types';

export interface PlaybackModeSelectHandle {
	destroy(): void;
	setMode(mode: PlaybackMode): void;
}

export interface PlaybackModeSelectOptions {
	className?: string;
	ariaLabel?: string;
	onChange: (mode: PlaybackMode) => void;
}

function syncPlaybackModeSelectClasses(select: HTMLSelectElement, mode: PlaybackMode): void {
	select.toggleClass('is-line-mode', isLinePlaybackMode(mode));
	select.toggleClass('is-progressive-rsvp', mode === 'progressiveRsvp');
}

export function mountPlaybackModeSelect(
	parent: HTMLElement,
	options: PlaybackModeSelectOptions
): PlaybackModeSelectHandle {
	const select = parent.createEl('select', {
		cls: options.className ?? 'speed-reader-ai-playback-mode-select',
		attr: options.ariaLabel ? { 'aria-label': options.ariaLabel } : undefined
	});

	for (const mode of PLAYBACK_MODE_ORDER) {
		select.createEl('option', { text: getPlaybackModeLabel(mode), value: mode });
	}

	const onChange = () => {
		const mode = select.value as PlaybackMode;
		syncPlaybackModeSelectClasses(select, mode);
		options.onChange(mode);
	};
	select.addEventListener('change', onChange);

	return {
		destroy() {
			select.removeEventListener('change', onChange);
			select.remove();
		},
		setMode(mode: PlaybackMode) {
			if (select.value !== mode) {
				select.value = mode;
			}
			syncPlaybackModeSelectClasses(select, mode);
		}
	};
}
