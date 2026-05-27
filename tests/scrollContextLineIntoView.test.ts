// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { scrollContextLineIntoView } from '../src/ui/readerShell/scrollContextLineIntoView';

describe('scrollContextLineIntoView', () => {
	it('scrolls when the current line is outside the container viewport', () => {
		const scrollContainer = document.createElement('div');
		const contextRoot = document.createElement('div');
		const currentLine = document.createElement('div');
		currentLine.className = 'is-current-line';
		contextRoot.appendChild(currentLine);
		scrollContainer.appendChild(contextRoot);

		currentLine.scrollIntoView = vi.fn();
		vi.spyOn(currentLine, 'getBoundingClientRect').mockReturnValue({
			top: 400,
			bottom: 430,
			left: 0,
			right: 100,
			width: 100,
			height: 30,
			x: 0,
			y: 400,
			toJSON: () => ({})
		} as DOMRect);
		vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue({
			top: 100,
			bottom: 200,
			left: 0,
			right: 100,
			width: 100,
			height: 100,
			x: 0,
			y: 100,
			toJSON: () => ({})
		} as DOMRect);

		scrollContextLineIntoView(scrollContainer, contextRoot, true);

		expect(currentLine.scrollIntoView).toHaveBeenCalledWith({
			block: 'center',
			behavior: 'smooth'
		});
	});

	it('does not scroll when the current line is already fully visible', () => {
		const scrollContainer = document.createElement('div');
		const contextRoot = document.createElement('div');
		const currentLine = document.createElement('div');
		currentLine.className = 'is-current-line';
		contextRoot.appendChild(currentLine);
		scrollContainer.appendChild(contextRoot);

		currentLine.scrollIntoView = vi.fn();
		vi.spyOn(currentLine, 'getBoundingClientRect').mockReturnValue({
			top: 120,
			bottom: 150,
			left: 0,
			right: 100,
			width: 100,
			height: 30,
			x: 0,
			y: 120,
			toJSON: () => ({})
		} as DOMRect);
		vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue({
			top: 100,
			bottom: 200,
			left: 0,
			right: 100,
			width: 100,
			height: 100,
			x: 0,
			y: 100,
			toJSON: () => ({})
		} as DOMRect);

		scrollContextLineIntoView(scrollContainer, contextRoot, false);

		expect(currentLine.scrollIntoView).not.toHaveBeenCalled();
	});
});
