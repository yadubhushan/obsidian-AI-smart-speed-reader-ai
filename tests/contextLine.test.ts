// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { RSVPEngine } from '../src/engine/rsvpEngine';
import type { ReaderState } from '../src/types';
import { mountContextLine, wordTextFromContextEvent } from '../src/ui/readerShell/contextLine';

const pausedState: ReaderState = {
	chunk: [],
	currentIndex: 0,
	totalWords: 10,
	progress: 0,
	isPlaying: false,
	finished: false,
	currentWpm: 200,
	timeRemainingMs: 0,
	currentHeading: null,
	playbackMode: 'rsvp'
};

function mockEngineWithParagraphContext(): RSVPEngine {
	return {
		getPauseSentenceContext: () => ({
			paragraphPrefix: 'Earlier in the paragraph.',
			paragraphSuffix: 'Later in the paragraph.',
			sentenceTokens: [
				{ text: 'Current', isCurrent: false },
				{ text: 'line', isCurrent: true }
			]
		}),
		getPauseLineContext: () => ({
			lines: [
				{
					isCurrentLine: false,
					tokens: [{ text: 'Previous', isCurrent: false }]
				},
				{
					isCurrentLine: true,
					tokens: [
						{ text: 'Current', isCurrent: false },
						{ text: 'line', isCurrent: true }
					]
				},
				{
					isCurrentLine: false,
					tokens: [{ text: 'Next', isCurrent: false }]
				}
			]
		}),
		getPauseParagraphLineContext: () => ({
			lines: [
				{
					isCurrentLine: false,
					tokens: [{ text: 'Line', isCurrent: false }, { text: 'one.', isCurrent: false }]
				},
				{
					isCurrentLine: true,
					tokens: [
						{ text: 'Current', isCurrent: false },
						{ text: 'line', isCurrent: true }
					]
				},
				{
					isCurrentLine: false,
					tokens: [{ text: 'Line', isCurrent: false }, { text: 'three.', isCurrent: false }]
				}
			]
		}),
		getPauseContext: () => []
	} as unknown as RSVPEngine;
}

describe('wordTextFromContextEvent', () => {
	it('returns word text when clicking a context word span', () => {
		const root = document.createElement('div');
		root.className = 'speed-reader-ai-context-line';
		const word = document.createElement('span');
		word.className = 'speed-reader-ai-context-word';
		word.textContent = 'obscure';
		root.appendChild(word);
		const event = new MouseEvent('click', { bubbles: true });
		Object.defineProperty(event, 'target', { value: word });

		expect(wordTextFromContextEvent(event)).toBe('obscure');
	});

	it('returns null for paragraph prefix clicks', () => {
		const root = document.createElement('div');
		const prefix = document.createElement('span');
		prefix.className = 'speed-reader-ai-context-paragraph-prefix';
		prefix.textContent = 'Earlier text';
		root.appendChild(prefix);
		const event = new MouseEvent('click', { bubbles: true });
		Object.defineProperty(event, 'target', { value: prefix });

		expect(wordTextFromContextEvent(event)).toBeNull();
	});

	it('returns null when target is not inside a context word', () => {
		const root = document.createElement('div');
		const event = new MouseEvent('click', { bubbles: true });
		Object.defineProperty(event, 'target', { value: root });

		expect(wordTextFromContextEvent(event)).toBeNull();
	});
});

function patchObsidianEl(el: HTMLElement) {
	el.empty = function () {
		this.textContent = '';
		while (this.firstChild) {
			this.removeChild(this.firstChild);
		}
	};
	el.addClass = function (cls: string) {
		for (const name of cls.split(/\s+/).filter(Boolean)) {
			this.classList.add(name);
		}
	};
	el.removeClass = function (cls: string) {
		for (const name of cls.split(/\s+/).filter(Boolean)) {
			this.classList.remove(name);
		}
	};
	el.toggleClass = function (cls: string, value: boolean) {
		this.classList.toggle(cls, value);
	};
	el.hasClass = function (cls: string) {
		return this.classList.contains(cls);
	};
	el.createDiv = function (opts?: { cls?: string; text?: string }) {
		const child = document.createElement('div');
		patchObsidianEl(child);
		if (opts?.cls) {
			child.className = opts.cls;
		}
		if (opts?.text) {
			child.textContent = opts.text;
		}
		this.appendChild(child);
		return child as HTMLElement;
	};
	el.createSpan = function (opts?: { cls?: string; text?: string }) {
		const child = document.createElement('span');
		patchObsidianEl(child);
		if (opts?.cls) {
			child.className = opts.cls;
		}
		if (opts?.text) {
			child.textContent = opts.text;
		}
		this.appendChild(child);
		return child as HTMLElement;
	};
}

function obsidianContainer(): HTMLElement {
	const container = document.createElement('div');
	patchObsidianEl(container);
	return container;
}

describe('mountContextLine lineOnlyContext', () => {
	beforeAll(() => {
		patchObsidianEl(HTMLElement.prototype as HTMLElement);
	});

	it('omits paragraph prefix and suffix when lineOnlyContext is true', () => {
		const container = obsidianContainer();
		const handle = mountContextLine(container, { lineOnlyContext: true });
		const engine = mockEngineWithParagraphContext();

		handle.render(pausedState, engine, true);

		const root = handle.getRootEl();
		expect(root.querySelector('.speed-reader-ai-context-paragraph-prefix')).toBeNull();
		expect(root.querySelector('.speed-reader-ai-context-paragraph-suffix')).toBeNull();
		expect(root.textContent).toContain('Current');
		expect(root.textContent).toContain('line');
		handle.destroy();
	});

	it('renders paragraph prefix and suffix when lineOnlyContext is false', () => {
		const container = obsidianContainer();
		const handle = mountContextLine(container, { lineOnlyContext: false });
		const engine = mockEngineWithParagraphContext();

		handle.render(pausedState, engine, true);

		const root = handle.getRootEl();
		expect(root.querySelector('.speed-reader-ai-context-paragraph-prefix')).not.toBeNull();
		expect(root.querySelector('.speed-reader-ai-context-paragraph-suffix')).not.toBeNull();
		handle.destroy();
	});

	it('renders current line with neighbors when neighborLines is set', () => {
		const container = obsidianContainer();
		const handle = mountContextLine(container, { neighborLines: 1 });
		const engine = mockEngineWithParagraphContext();

		handle.render(pausedState, engine, true);

		const root = handle.getRootEl();
		expect(root.querySelector('.speed-reader-ai-context-paragraph-prefix')).toBeNull();
		expect(root.querySelectorAll('.speed-reader-ai-context-line-row')).toHaveLength(3);
		expect(root.querySelector('.speed-reader-ai-context-line-row.is-current-line')).not.toBeNull();
		expect(root.querySelectorAll('.speed-reader-ai-context-line-row.is-adjacent-line')).toHaveLength(2);
		handle.destroy();
	});

	it('renders paragraph lines when paragraphLines is set', () => {
		const container = obsidianContainer();
		const scrollContainer = document.createElement('div');
		container.appendChild(scrollContainer);
		const handle = mountContextLine(scrollContainer, {
			paragraphLines: true,
			scrollContainer
		});
		const engine = mockEngineWithParagraphContext();

		handle.render(pausedState, engine, true);

		const root = handle.getRootEl();
		expect(root.classList.contains('is-paragraph-lines')).toBe(true);
		expect(root.querySelectorAll('.speed-reader-ai-context-line-row')).toHaveLength(3);
		handle.destroy();
	});
});
