import { Sparkles } from 'lucide-react';
import { mountContextLine, type ContextLineHandle } from '../contextLine';
import { createM4Icon } from './m4Icons';

export interface M4ContextVisualizerHandle {
	getRootEl(): HTMLElement;
	getContextLineHandle(): ContextLineHandle;
	destroy(): void;
}

export interface M4ContextVisualizerOptions {
	onWordSeek: (word: string) => void;
	onWordLookup: (word: string) => void;
	enableDesktopDoubleTapLookup?: boolean;
}

export function mountM4ContextVisualizer(
	container: HTMLElement,
	options: M4ContextVisualizerOptions
): M4ContextVisualizerHandle {
	const root = container.createDiv({ cls: 'speed-reader-m4-context-visualizer speed-reader-m4-context-panel' });
	const header = root.createDiv({ cls: 'speed-reader-m4-context-visualizer__header' });
	const titleRow = header.createDiv({ cls: 'speed-reader-m4-context-visualizer__title-row' });
	titleRow.appendChild(
		createM4Icon(Sparkles, {
			className: 'speed-reader-m4-icon speed-reader-m4-icon--warn',
			size: 14
		})
	);
	titleRow.createSpan({ text: 'Context visualizer', cls: 'speed-reader-m4-context-visualizer__title' });
	header.createSpan({
		text: 'tap to jump · double tap for definition',
		cls: 'speed-reader-m4-context-visualizer__hint'
	});

	const body = root.createDiv({ cls: 'speed-reader-m4-context-visualizer__body' });
	const contextLine = mountContextLine(body, {
		enableClickActivation: false,
		paragraphLines: true,
		scrollContainer: body,
		onWordActivate: options.onWordSeek
	});
	contextLine.getRootEl().addClass('speed-reader-m4-context-line-inner');

	let lastTapWord: string | null = null;
	let lastTapAt = 0;
	const DOUBLE_MS = 300;

	const onWordPointerUp = (event: PointerEvent) => {
		const target = (event.target as HTMLElement).closest('.speed-reader-ai-context-word');
		if (!target) {
			return;
		}
		const word = target.textContent?.trim();
		if (!word) {
			return;
		}
		const now = Date.now();
		if (
			options.enableDesktopDoubleTapLookup &&
			lastTapWord === word &&
			now - lastTapAt <= DOUBLE_MS
		) {
			lastTapWord = null;
			lastTapAt = 0;
			event.preventDefault();
			event.stopPropagation();
			options.onWordLookup(word);
			return;
		}
		lastTapWord = word;
		lastTapAt = now;
		window.setTimeout(() => {
			if (lastTapAt === now && lastTapWord === word) {
				options.onWordSeek(word);
				lastTapWord = null;
			}
		}, DOUBLE_MS + 20);
	};

	body.addEventListener('pointerup', onWordPointerUp);

	return {
		getRootEl() {
			return root;
		},
		getContextLineHandle() {
			return contextLine;
		},
		destroy() {
			body.removeEventListener('pointerup', onWordPointerUp);
			contextLine.destroy();
			root.remove();
		}
	};
}
