import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LucideIcon } from 'lucide-react';

export interface M4IconOptions {
	className?: string;
	size?: number;
	strokeWidth?: number;
}

/** Mount a Lucide icon into a span for vanilla Obsidian DOM UI. */
export function createM4Icon(Icon: LucideIcon, options: M4IconOptions = {}): HTMLElement {
	const { className = 'speed-reader-m4-icon', size = 16, strokeWidth = 2 } = options;
	const host = document.createElement('span');
	host.className = className;
	host.setAttribute('aria-hidden', 'true');
	host.innerHTML = renderToStaticMarkup(
		createElement(Icon, {
			className: 'speed-reader-m4-icon__svg',
			size,
			strokeWidth,
			'aria-hidden': true
		})
	);
	return host;
}

/** Append a Lucide icon to an existing Obsidian/HTML button. */
export function appendM4IconToButton(
	button: HTMLElement,
	Icon: LucideIcon,
	options: M4IconOptions = {}
): void {
	button.appendChild(createM4Icon(Icon, options));
}
