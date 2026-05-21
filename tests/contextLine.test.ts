// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { wordTextFromContextEvent } from '../src/ui/readerShell/contextLine';

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
