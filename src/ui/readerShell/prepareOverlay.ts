export const PREPARE_OVERLAY_PRIMARY = 'Preparing with AI…';

export interface PrepareOverlayHandle {
	show(): void;
	hide(): void;
	update(subline?: string): void;
	isVisible(): boolean;
	destroy(): void;
}

export interface PrepareOverlayRenderState {
	visible: boolean;
	subline: string | null;
}

export interface PrepareOverlayControllerDeps {
	render(state: PrepareOverlayRenderState): void;
}

/** Visibility/subline state machine for the "Preparing with AI…" overlay. */
export function createPrepareOverlayController(deps: PrepareOverlayControllerDeps) {
	let visible = false;
	let subline: string | null = null;

	const render = () => deps.render({ visible, subline });

	return {
		show(): void {
			subline = null;
			visible = true;
			render();
		},
		hide(): void {
			visible = false;
			subline = null;
			render();
		},
		update(next?: string): void {
			subline = next && next.length > 0 ? next : null;
			render();
		},
		isVisible(): boolean {
			return visible;
		}
	};
}

/** Mounts the prepare overlay into the word container and binds the controller to it. */
export function mountPrepareOverlay(wordContainer: HTMLElement): PrepareOverlayHandle {
	const overlayEl = wordContainer.createDiv({
		cls: 'speed-reader-ai-prepare-overlay is-hidden'
	});
	overlayEl.createDiv({ cls: 'speed-reader-ai-prepare-spinner' });
	overlayEl.createSpan({
		cls: 'speed-reader-ai-prepare-title',
		text: PREPARE_OVERLAY_PRIMARY
	});
	const sublineEl = overlayEl.createSpan({
		cls: 'speed-reader-ai-prepare-subline is-hidden'
	});

	const controller = createPrepareOverlayController({
		render: ({ visible, subline }) => {
			overlayEl.toggleClass('is-hidden', !visible);
			sublineEl.toggleClass('is-hidden', subline === null);
			sublineEl.setText(subline ?? '');
		}
	});

	return {
		show: controller.show,
		hide: controller.hide,
		update: controller.update,
		isVisible: controller.isVisible,
		destroy(): void {
			overlayEl.remove();
		}
	};
}
