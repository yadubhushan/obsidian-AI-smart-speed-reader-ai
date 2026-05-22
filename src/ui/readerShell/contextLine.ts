import type { RSVPEngine } from '../../engine/rsvpEngine';
import type { ReaderState } from '../../types';

export interface ContextLineHandle {
	destroy(): void;
	getRootEl(): HTMLElement;
	render(state: ReaderState | null, engine: RSVPEngine, showContext: boolean): void;
	setVisible(visible: boolean): void;
}

export interface MountContextLineOptions {
	onWordActivate?: (word: string) => void;
	/** Desktop uses click; mobile uses pointer gestures in mobileGestures.ts */
	enableClickActivation?: boolean;
	/** Mobile: show current sentence only when paused (no paragraph prefix/suffix). */
	lineOnlyContext?: boolean;
}

export function wordTextFromContextEvent(event: Event): string | null {
	const target = (event.target as HTMLElement | null)?.closest?.(
		'.speed-reader-ai-context-word'
	);
	const text = target?.textContent?.trim();
	return text?.length ? text : null;
}

export function mountContextLine(
	container: HTMLElement,
	options: MountContextLineOptions = {}
): ContextLineHandle {
	const el = container.createDiv({ cls: 'speed-reader-ai-context-line' });

	const onWordClick = (event: MouseEvent) => {
		const word = wordTextFromContextEvent(event);
		if (!word) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		options.onWordActivate?.(word);
	};

	if (options.enableClickActivation !== false) {
		el.addEventListener('click', onWordClick);
	}

	return {
		destroy() {
			if (options.enableClickActivation !== false) {
				el.removeEventListener('click', onWordClick);
			}
			el.remove();
		},
		getRootEl() {
			return el;
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

			const paused = !state.isPlaying;

			if (paused) {
				const sentenceContext = engine.getPauseSentenceContext();
				if (!sentenceContext || sentenceContext.sentenceTokens.length === 0) {
					el.addClass('is-hidden');
					return;
				}

				el.removeClass('is-hidden');
				el.addClass('is-paused');

				if (
					!options.lineOnlyContext &&
					sentenceContext.paragraphPrefix?.trim()
				) {
					el.createSpan({
						cls: 'speed-reader-ai-context-paragraph speed-reader-ai-context-paragraph-prefix',
						text: `${sentenceContext.paragraphPrefix.trim()} `
					});
				}

				for (let i = 0; i < sentenceContext.sentenceTokens.length; i++) {
					const token = sentenceContext.sentenceTokens[i]!;
					if (i > 0) {
						el.createSpan({ text: ' ' });
					}
					el.createSpan({
						cls: `speed-reader-ai-context-word${token.isCurrent ? ' is-current' : ''}`,
						text: token.text
					});
				}

				if (
					!options.lineOnlyContext &&
					sentenceContext.paragraphSuffix?.trim()
				) {
					el.createSpan({
						cls: 'speed-reader-ai-context-paragraph speed-reader-ai-context-paragraph-suffix',
						text: ` ${sentenceContext.paragraphSuffix.trim()}`
					});
				}
				return;
			}

			const tokens = engine.getPauseContext();
			if (tokens.length === 0) {
				el.addClass('is-hidden');
				return;
			}

			el.removeClass('is-hidden');

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
