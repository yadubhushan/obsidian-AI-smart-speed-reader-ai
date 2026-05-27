export function renderHistoryStatsView(container: HTMLElement): void {
	const root = container.createDiv({ cls: 'speed-reader-landing-history', attr: { 'aria-hidden': 'true' } });

	const header = root.createDiv({ cls: 'speed-reader-landing-history__header' });
	header.createEl('h2', { text: 'Stats & History' });
	header.createEl('p', { text: 'Track your cognitive reading analytics' });

	const overview = root.createDiv({ cls: 'speed-reader-landing-history__overview' });
	overview.createSpan({ cls: 'speed-reader-landing-history__overview-label', text: 'Last 30 Days' });
	const valueRow = overview.createDiv({ cls: 'speed-reader-landing-history__overview-value-row' });
	valueRow.createSpan({ cls: 'speed-reader-landing-history__overview-value', text: '48,250' });
	valueRow.createSpan({ cls: 'speed-reader-landing-history__overview-delta', text: '+12.4%' });
	overview.createEl('p', {
		cls: 'speed-reader-landing-history__overview-caption',
		text: 'Total Words Read Successfully'
	});

	overview.createDiv({ cls: 'speed-reader-landing-history__divider' });

	const miniStats = overview.createDiv({ cls: 'speed-reader-landing-history__mini-stats' });
	for (const stat of [
		{ label: 'Avg Speed', value: '420 WPM', cls: 'is-speed' },
		{ label: 'Reading Time', value: '115 Mins', cls: 'is-time' },
		{ label: 'Saved Time', value: '4.2 Hrs', cls: 'is-saved' }
	]) {
		const cell = miniStats.createDiv({ cls: 'speed-reader-landing-history__mini-stat' });
		cell.createSpan({ cls: 'speed-reader-landing-history__mini-label', text: stat.label });
		cell.createSpan({
			cls: `speed-reader-landing-history__mini-value ${stat.cls}`,
			text: stat.value
		});
	}

	const chart = root.createDiv({ cls: 'speed-reader-landing-history__chart' });
	const chartHeader = chart.createDiv({ cls: 'speed-reader-landing-history__chart-header' });
	chartHeader.createSpan({ text: 'Weekly Volume Trend' });
	chartHeader.createSpan({ cls: 'speed-reader-landing-history__chart-badge', text: 'Words/Week' });

	const bars = chart.createDiv({ cls: 'speed-reader-landing-history__bars' });
	for (const bar of [
		{ label: 'W1', height: 65, value: '8.2k' },
		{ label: 'W2', height: 80, value: '11.5k' },
		{ label: 'W3', height: 90, value: '14.1k', accent: true },
		{ label: 'W4', height: 95, value: '16.4k', highlight: true }
	]) {
		const col = bars.createDiv({ cls: 'speed-reader-landing-history__bar-col' });
		const track = col.createDiv({ cls: 'speed-reader-landing-history__bar-track' });
		track.createDiv({
			cls: `speed-reader-landing-history__bar-fill${
				bar.accent ? ' is-accent' : ''
			}${bar.highlight ? ' is-highlight' : ''}`,
			attr: { style: `height: ${bar.height}%` }
		});
		track.createSpan({
			cls: 'speed-reader-landing-history__bar-tooltip',
			text: bar.value
		});
		col.createSpan({
			cls: `speed-reader-landing-history__bar-label${
				bar.highlight ? ' is-highlight' : ''
			}`,
			text: bar.label
		});
	}
}
