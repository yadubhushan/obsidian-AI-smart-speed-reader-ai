const RING_SIZE = 40;
const STROKE_WIDTH = 3;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function renderProgressRing(container: HTMLElement, percent: number): void {
	container.empty();
	container.addClass('speed-reader-progress-ring');

	const clamped = Math.max(0, Math.min(100, Math.round(percent)));
	const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
	const muted = clamped === 0;

	const svg = container.createSvg('svg', {
		attr: {
			width: String(RING_SIZE),
			height: String(RING_SIZE),
			viewBox: `0 0 ${RING_SIZE} ${RING_SIZE}`,
			class: muted ? 'speed-reader-progress-ring__svg is-muted' : 'speed-reader-progress-ring__svg'
		}
	});

	const track = svg.createSvg('circle', {
		attr: {
			cx: String(RING_SIZE / 2),
			cy: String(RING_SIZE / 2),
			r: String(RADIUS),
			class: 'speed-reader-progress-ring__track'
		}
	});
	track.setAttribute('fill', 'none');
	track.setAttribute('stroke-width', String(STROKE_WIDTH));

	const progress = svg.createSvg('circle', {
		attr: {
			cx: String(RING_SIZE / 2),
			cy: String(RING_SIZE / 2),
			r: String(RADIUS),
			class: 'speed-reader-progress-ring__progress'
		}
	});
	progress.setAttribute('fill', 'none');
	progress.setAttribute('stroke-width', String(STROKE_WIDTH));
	progress.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
	progress.setAttribute('stroke-dashoffset', String(offset));
	progress.setAttribute('transform', `rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`);

	container.createSpan({
		cls: 'speed-reader-progress-ring__label',
		text: `${clamped}%`
	});
}
