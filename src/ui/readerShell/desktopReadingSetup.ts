import { setIcon } from 'obsidian';
import type { PrepareUiStatus } from '../prepareControls';

export interface DesktopReadingSetupHandle {
	destroy(): void;
	getModeHost(): HTMLElement;
	getVersionHost(): HTMLElement;
	setVisible(visible: boolean): void;
	setStatus(status: PrepareUiStatus): void;
	setPreparing(preparing: boolean): void;
}

function iconButtonContent(button: HTMLButtonElement, icon: string, label: string): void {
	button.empty();
	const iconEl = button.createSpan({ cls: 'speed-reader-ai-adaptive-icon' });
	setIcon(iconEl, icon);
	button.createSpan({ text: label });
}

export function mountDesktopReadingSetup(
	container: HTMLElement,
	handlers: {
		onReadLocally: () => void;
		onPrepareWithAi: () => void | Promise<void>;
		onClearCache: () => void | Promise<void>;
	}
): DesktopReadingSetupHandle {
	const root = container.createDiv({
		cls: 'speed-reader-ai-reading-setup is-hidden',
		attr: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Reading setup' }
	});
	const card = root.createDiv({ cls: 'speed-reader-ai-reading-setup-card' });
	const eyebrow = card.createDiv({ cls: 'speed-reader-ai-reading-setup-eyebrow' });
	const sparkles = eyebrow.createSpan({ cls: 'speed-reader-ai-adaptive-icon' });
	setIcon(sparkles, 'sparkles');
	eyebrow.createSpan({ text: 'Reading setup' });
	card.createEl('h2', { text: 'How would you like to read this note?' });
	card.createEl('p', {
		cls: 'speed-reader-ai-reading-setup-copy',
		text: 'Start immediately with local processing, or prepare an enhanced structure with AI.'
	});

	const configuration = card.createDiv({ cls: 'speed-reader-ai-reading-setup-configuration' });
	const modeHost = configuration.createDiv({ cls: 'speed-reader-ai-reading-setup-mode-host' });
	const versionHost = configuration.createDiv({ cls: 'speed-reader-ai-reading-setup-version-host' });
	const status = card.createDiv({
		cls: 'speed-reader-ai-reading-setup-status',
		attr: { 'aria-live': 'polite' }
	});

	const actions = card.createDiv({ cls: 'speed-reader-ai-reading-setup-actions' });
	const localButton = actions.createEl('button', {
		cls: 'speed-reader-ai-adaptive-button speed-reader-ai-adaptive-button-secondary',
		attr: { type: 'button' }
	});
	iconButtonContent(localButton, 'zap', 'Read locally');
	const prepareButton = actions.createEl('button', {
		cls: 'speed-reader-ai-adaptive-button speed-reader-ai-adaptive-button-primary',
		attr: { type: 'button' }
	});
	iconButtonContent(prepareButton, 'sparkles', 'Prepare with AI');
	const clearButton = actions.createEl('button', {
		cls: 'speed-reader-ai-adaptive-button speed-reader-ai-adaptive-button-secondary speed-reader-ai-reading-setup-clear is-hidden',
		attr: { type: 'button' }
	});
	iconButtonContent(clearButton, 'trash-2', 'Clear AI cache');

	localButton.addEventListener('click', handlers.onReadLocally);
	prepareButton.addEventListener('click', () => void handlers.onPrepareWithAi());
	clearButton.addEventListener('click', () => void handlers.onClearCache());

	const setStatus = (next: PrepareUiStatus) => {
		status.removeClass('is-success', 'is-warning', 'is-error', 'is-busy');
		switch (next) {
			case 'prepared':
				status.addClass('is-success');
				status.setText('AI preparation is ready.');
				break;
			case 'stale':
				status.addClass('is-warning');
				status.setText('This note changed since it was prepared. Read locally or prepare it again.');
				break;
			case 'error':
				status.addClass('is-error');
				status.setText('AI preparation failed. You can still read locally.');
				break;
			case 'preparing':
				status.addClass('is-busy');
				status.setText('Preparing the note with AI…');
				break;
			case 'deterministic':
				status.setText('Local processing is ready.');
				break;
			default:
				status.setText('Local processing stays on this device and is available immediately.');
		}
		clearButton.toggleClass(
			'is-hidden',
			!['prepared', 'stale', 'error'].includes(next)
		);
	};
	setStatus('idle');

	return {
		destroy() {
			root.remove();
		},
		getModeHost: () => modeHost,
		getVersionHost: () => versionHost,
		setVisible(visible) {
			const becameVisible = visible && !root.classList.contains('is-visible');
			root.toggleClass('is-hidden', !visible);
			root.toggleClass('is-visible', visible);
			if (becameVisible) {
				localButton.focus();
			}
		},
		setStatus,
		setPreparing(preparing) {
			localButton.disabled = preparing;
			prepareButton.disabled = preparing;
			clearButton.disabled = preparing;
			if (preparing) {
				setStatus('preparing');
			}
		}
	};
}
