import type { RSVPEngine } from '../../engine/rsvpEngine';
import type { ReaderState } from '../../types';
import { scrollContextLineIntoView } from './scrollContextLineIntoView';

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
	/** When set, show current line plus this many lines above/below. */
	neighborLines?: number;
	/** When true, show every sentence line in the current paragraph. */
	paragraphLines?: boolean;
	/** Scroll container for auto-scrolling the active line into view. */
	scrollContainer?: HTMLElement;
}

export function wordTextFromContextEvent(event: Event): string | null {
	const target = (event.target as HTMLElement | null)?.closest?.(
		'.speed-reader-ai-context-word'
	);
	const text = target?.textContent?.trim();
	return text?.length ? text : null;
}

function appendContextTokens(
	parent: HTMLElement,
	tokens: Array<{ text: string; isCurrent: boolean }>
): void {
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!;
		if (i > 0) {
			parent.createSpan({ text: ' ' });
		}
		parent.createSpan({
			cls: `speed-reader-ai-context-word${token.isCurrent ? ' is-current' : ''}`,
			text: token.text
		});
	}
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

	const usesLineContext =
		options.paragraphLines || options.neighborLines !== undefined;

	const renderLineContext = (engine: RSVPEngine, state: ReaderState) => {
		const lineContext = options.paragraphLines
			? engine.getPauseParagraphLineContext()
			: engine.getPauseLineContext(options.neighborLines ?? 0);
		if (!lineContext || lineContext.lines.length === 0) {
			el.addClass('is-hidden');
			return;
		}

		el.removeClass('is-hidden');
		el.addClass('is-paused');
		el.addClass('is-multi-line');
		if (options.paragraphLines) {
			el.addClass('is-paragraph-lines');
		}

		for (let i = 0; i < lineContext.lines.length; i++) {
			const line = lineContext.lines[i]!;
			const row = el.createDiv({
				cls: `speed-reader-ai-context-line-row${line.isCurrentLine ? ' is-current-line' : ' is-adjacent-line'}`
			});
			appendContextTokens(row, line.tokens);
		}

		if (options.scrollContainer) {
			const scrollContainer = options.scrollContainer;
			const smooth = !state.isPlaying;
			requestAnimationFrame(() => {
				scrollContextLineIntoView(scrollContainer, el, smooth);
			});
		}
	};

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
			el.removeClass('is-multi-line');
			el.removeClass('is-paragraph-lines');

			if (!showContext || !state || state.finished) {
				el.addClass('is-hidden');
				return;
			}

			if (usesLineContext) {
				renderLineContext(engine, state);
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

				appendContextTokens(el, sentenceContext.sentenceTokens);

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
			appendContextTokens(el, tokens);
		}
	};
}
