export interface M4ReaderModeBarHandle {
	setChunkSize(size: number): void;
	setGuideLineEnabled(enabled: boolean): void;
	destroy(): void;
}

export interface M4ReaderModeBarOptions {
	chunkSize: number;
	showGuideLine: boolean;
	onChunkSizeChange: (size: 1 | 2 | 3) => void;
	onGuideLineToggle: (enabled: boolean) => void;
}

export function mountM4ReaderModeBar(
	container: HTMLElement,
	options: M4ReaderModeBarOptions
): M4ReaderModeBarHandle {
	const bar = container.createDiv({ cls: 'speed-reader-m4-mode-bar speed-reader-m4-chrome' });
	bar.createSpan({ text: 'Reader mode', cls: 'speed-reader-m4-mode-bar__label' });
	const btnRow = bar.createDiv({ cls: 'speed-reader-m4-mode-bar__buttons' });

	const chunkButtons = new Map<number, HTMLButtonElement>();
	for (const size of [1, 2, 3] as const) {
		const btn = btnRow.createEl('button', {
			cls: 'speed-reader-m4-mode-btn',
			text: `${size}w`,
			attr: { type: 'button' }
		});
		btn.addEventListener('click', () => options.onChunkSizeChange(size));
		chunkButtons.set(size, btn);
	}

	const lineBtn = btnRow.createEl('button', {
		cls: 'speed-reader-m4-mode-btn speed-reader-m4-mode-btn--line',
		text: 'line',
		attr: { type: 'button', title: 'Toggle visual guide line' }
	});
	lineBtn.addEventListener('click', () => {
		options.onGuideLineToggle(!lineBtn.hasClass('is-active'));
	});

	const sync = () => {
		for (const [size, btn] of chunkButtons) {
			btn.toggleClass('is-active', size === options.chunkSize);
		}
		lineBtn.toggleClass('is-active', options.showGuideLine);
	};
	sync();

	return {
		setChunkSize(size: number) {
			options.chunkSize = size;
			sync();
		},
		setGuideLineEnabled(enabled: boolean) {
			options.showGuideLine = enabled;
			sync();
		},
		destroy() {
			bar.remove();
		}
	};
}
