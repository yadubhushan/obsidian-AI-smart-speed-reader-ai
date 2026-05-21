import type { RSVPEngine } from '../../engine/rsvpEngine';
import type { ReaderState } from '../../types';

export interface ContextLineHandle {
	destroy(): void;
	render(state: ReaderState | null, engine: RSVPEngine, showContext: boolean): void;
	setVisible(visible: boolean): void;
}

export function mountContextLine(container: HTMLElement): ContextLineHandle {
	const el = container.createDiv({ cls: 'speed-reader-ai-context-line' });

	return {
		destroy() {
			el.remove();
		},
		setVisible(visible) {
			el.toggleClass('is-hidden', !visible);
		},
		render(state, engine, showContext) {
			el.empty();
			el.removeClass('is-paused');

			if (!showContext || !state || state.finished) {
				el.addClass('is-hidden');
				return;
			}

			const tokens = engine.getPauseContext();
			if (tokens.length === 0) {
				el.addClass('is-hidden');
				return;
			}

			el.removeClass('is-hidden');

			if (!state.isPlaying) {
				el.addClass('is-paused');
			}

			for (let i = 0; i < tokens.length; i++) {
				const token = tokens[i]!;
				if (i > 0) {
					el.createSpan({ text: ' ' });
				}
				el.createSpan({
					cls: `speed-reader-ai-context-word${token.isCurrent ? ' is-current' : ''}`,
					text: token.text
				});
			}
		}
	};
}
