export type PrepareUiStatus =
	| 'deterministic'
	| 'preparing'
	| 'prepared'
	| 'stale'
	| 'error'
	| 'idle';

export interface PrepareControlsHandle {
	destroy(): void;
	setStatus(status: PrepareUiStatus): void;
	setPreparing(preparing: boolean): void;
}

export function mountPrepareControls(
	container: HTMLElement,
	handlers: {
		onReadWithoutAi: () => void;
		onPrepare: () => void | Promise<void>;
		onClearCache: () => void | Promise<void>;
	}
): PrepareControlsHandle {
	const row = container.createDiv({ cls: 'speed-reader-ai-prepare-row' });

	const readBtn = row.createEl('button', {
		cls: 'speed-reader-ai-btn speed-reader-ai-btn-secondary',
		text: 'Read without AI'
	});
	const prepareBtn = row.createEl('button', {
		cls: 'speed-reader-ai-btn speed-reader-ai-btn-primary',
		text: 'Prepare with AI'
	});
	const clearCacheBtn = row.createEl('button', {
		cls: 'speed-reader-ai-btn speed-reader-ai-btn-secondary speed-reader-ai-btn-destructive',
		text: 'Clear AI cache'
	});
	const statusEl = row.createSpan({ cls: 'speed-reader-ai-status-badge' });

	let currentStatus: PrepareUiStatus = 'idle';

	const updatePrepareButton = () => {
		prepareBtn.removeClass('speed-reader-ai-btn-primary', 'speed-reader-ai-btn-secondary');

		if (currentStatus === 'prepared') {
			prepareBtn.addClass('speed-reader-ai-btn-secondary');
			prepareBtn.setText('Re-prepare');
			return;
		}

		prepareBtn.addClass('speed-reader-ai-btn-primary');
		prepareBtn.setText('Prepare with AI');
	};

	const updateClearCacheButton = () => {
		const show =
			currentStatus === 'prepared' ||
			currentStatus === 'stale' ||
			currentStatus === 'error';
		clearCacheBtn.toggleClass('is-hidden', !show);
	};

	const updateBadge = () => {
		statusEl.empty();
		statusEl.removeClass('is-prepared', 'is-stale', 'is-deterministic', 'is-preparing', 'is-error');

		switch (currentStatus) {
			case 'preparing':
				statusEl.addClass('is-preparing');
				statusEl.setText('Preparing…');
				break;
			case 'prepared':
				statusEl.addClass('is-prepared');
				statusEl.setText('Prepared');
				break;
			case 'stale':
				statusEl.addClass('is-stale');
				statusEl.setText('Stale — document changed');
				break;
			case 'deterministic':
				statusEl.addClass('is-deterministic');
				statusEl.setText('Reading without AI (deterministic)');
				break;
			case 'error':
				statusEl.addClass('is-error');
				statusEl.setText('Prepare failed');
				break;
			default:
				statusEl.addClass('is-hidden');
				break;
		}

		updatePrepareButton();
		updateClearCacheButton();
	};

	const onRead = () => handlers.onReadWithoutAi();
	const onPrep = () => void handlers.onPrepare();
	const onClear = () => void handlers.onClearCache();
	readBtn.addEventListener('click', onRead);
	prepareBtn.addEventListener('click', onPrep);
	clearCacheBtn.addEventListener('click', onClear);
	clearCacheBtn.addClass('is-hidden');

	updateBadge();

	return {
		destroy() {
			readBtn.removeEventListener('click', onRead);
			prepareBtn.removeEventListener('click', onPrep);
			clearCacheBtn.removeEventListener('click', onClear);
			row.remove();
		},
		setStatus(status: PrepareUiStatus) {
			currentStatus = status;
			updateBadge();
		},
		setPreparing(preparing: boolean) {
			prepareBtn.disabled = preparing;
			readBtn.disabled = preparing;
			if (preparing) {
				currentStatus = 'preparing';
			}
			updateBadge();
		}
	};
}
