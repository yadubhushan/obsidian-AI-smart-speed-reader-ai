export function createLandingIcon(name: string, className = 'speed-reader-landing-icon'): SVGSVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('class', className);
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '2');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	svg.setAttribute('aria-hidden', 'true');

	const paths: Record<string, string> = {
		play: 'M8 5v14l11-7z',
		clock: 'M12 6v6l4 2 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
		chevronRight: 'M9 18l6-6-6-6',
		home: 'M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z',
		calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
		user: 'M20 21a8 8 0 0 0-16 0 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
		library: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
		check: 'M20 6 9 17l-5-5',
		trendingUp: 'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
		arrowUpRight: 'M7 17 17 7 M7 7h10v10',
		fileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
		moreVertical: 'M12 12h.01 M12 5h.01 M12 19h.01'
	};

	const pathData = paths[name];
	if (!pathData) {
		return svg;
	}

	for (const segment of pathData.split(' M')) {
		const d = segment.startsWith('M') ? segment : `M${segment}`;
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', d);
		if (name === 'play') {
			path.setAttribute('fill', 'currentColor');
			path.setAttribute('stroke', 'none');
		}
		svg.appendChild(path);
	}

	return svg;
}
