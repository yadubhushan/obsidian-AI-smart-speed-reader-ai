import { mountMobileSwipeBack } from './mobileSwipeBack';

export interface MobileStackChromeHandle {
	destroy(): void;
	setTitle(title: string): void;
	onBack(cb: () => void): void;
	onSwipeBack(cb: () => void): void;
}

export interface MobileStackChromeOptions {
	title: string;
	scrollEl: HTMLElement;
	ignoreSwipeSelectors?: string;
}

export function mountMobileStackChrome(
	pane: HTMLElement,
	options: MobileStackChromeOptions
): MobileStackChromeHandle {
	const header = pane.createDiv({ cls: 'speed-reader-ai-mobile-stack-header' });
	const backBtn = header.createEl('button', {
		cls: 'speed-reader-ai-mobile-stack-back',
		text: '‹',
		attr: { type: 'button', 'aria-label': 'Back to reading' }
	});
	const titleEl = header.createDiv({
		cls: 'speed-reader-ai-mobile-stack-title',
		text: options.title
	});

	let backHandler: (() => void) | null = null;

	const triggerBack = () => {
		backHandler?.();
	};

	backBtn.addEventListener('click', () => triggerBack());

	const ignoreSelector = options.ignoreSwipeSelectors ?? '';
	const shouldIgnoreTarget = (target: EventTarget | null) => {
		if (!(target instanceof HTMLElement)) {
			return false;
		}
		const selectors = [
			'button',
			'input',
			'label',
			'select',
			'textarea',
			'a',
			'.speed-reader-ai-mobile-stack-back',
			ignoreSelector
		]
			.filter(Boolean)
			.join(', ');
		return Boolean(target.closest(selectors));
	};

	const cleanups: Array<() => void> = [
		mountMobileSwipeBack(options.scrollEl, () => triggerBack(), { shouldIgnoreTarget })
	];

	return {
		destroy() {
			for (const cleanup of cleanups) {
				cleanup();
			}
			header.remove();
		},
		setTitle(title) {
			titleEl.setText(title);
		},
		onBack(cb) {
			backHandler = cb;
		},
		onSwipeBack(cb) {
			backHandler = cb;
		}
	};
}
