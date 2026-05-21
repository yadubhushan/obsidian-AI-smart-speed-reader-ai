import type { ReaderState } from '../../types';

export interface ReaderHeaderHandle {
	destroy(): void;
	update(state: ReaderState | null): void;
	setProgressVisible(visible: boolean): void;
	onPlayPause(cb: () => void): void;
	onProgressClick(cb: (percentage: number) => void): void;
}

function formatRemainingTime(milliseconds: number): string {
	const totalSeconds = Math.ceil(milliseconds / 1000);
	if (totalSeconds < 60) {
		return `${totalSeconds}s left`;
	}
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (seconds === 0) {
		return `${minutes}m left`;
	}
	return `${minutes}m ${seconds}s left`;
}

export function mountReaderHeader(
	container: HTMLElement,
	options: {
		chunkSize: number;
		rtl: boolean;
		showRemainingTime: boolean;
		showProgress: boolean;
	}
): ReaderHeaderHandle {
	const header = container.createDiv({ cls: 'speed-reader-ai-header' });
	const left = header.createDiv({ cls: 'speed-reader-ai-header-left' });
	const playBtn = left.createEl('button', {
		cls: 'speed-reader-ai-header-play',
		text: '▶ Play',
		attr: { type: 'button' }
	});

	const progressWrap = header.createDiv({ cls: 'speed-reader-ai-header-progress-wrap' });
	const progressBar = progressWrap.createDiv({ cls: 'speed-reader-ai-header-progress' });
	const progressFill = progressBar.createDiv({ cls: 'speed-reader-ai-header-progress-fill' });

	const badge = header.createDiv({ cls: 'speed-reader-ai-header-badge' });
	const badgeText = badge.createSpan({ cls: 'speed-reader-ai-header-badge-text' });

	let playPauseHandler: (() => void) | null = null;
	let progressClickHandler: ((percentage: number) => void) | null = null;

	playBtn.addEventListener('click', () => playPauseHandler?.());
	progressBar.addEventListener('click', (event) => {
		const rect = progressBar.getBoundingClientRect();
		if (rect.width <= 0) {
			return;
		}
		const percentage = (event.clientX - rect.left) / rect.width;
		progressClickHandler?.(percentage);
	});

	progressWrap.toggleClass('is-hidden', !options.showProgress);

	return {
		destroy() {
			header.remove();
		},
		update(state) {
			if (!state) {
				badgeText.setText(`WPM: ${options.chunkSize > 1 ? options.chunkSize : 1} · ${options.rtl ? 'RTL' : 'LTR'}`);
				return;
			}
			playBtn.setText(state.isPlaying ? '⏸ Pause' : '▶ Play');
			progressFill.style.width = `${Math.min(state.progress, 100)}%`;
			const direction = options.rtl ? 'RTL' : 'LTR';
			const chunkLabel = `(${options.chunkSize})`;
			const timePart =
				options.showRemainingTime && !state.finished
					? ` · ${formatRemainingTime(state.timeRemainingMs)}`
					: '';
			badgeText.setText(
				`English WPM: ${Math.round(state.currentWpm)} ${chunkLabel} ${direction}${timePart}`
			);
		},
		setProgressVisible(visible) {
			progressWrap.toggleClass('is-hidden', !visible);
		},
		onPlayPause(cb) {
			playPauseHandler = cb;
		},
		onProgressClick(cb) {
			progressClickHandler = cb;
		}
	};
}
