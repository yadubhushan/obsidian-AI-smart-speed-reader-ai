import { setIcon, type App } from 'obsidian';
import type { ManifestStore } from '../../store/ManifestStore';
import type { PluginServices } from '../../services/serviceRegistry';
import { continueReading, resolveContinueReadingTarget } from '../continueReading';
import { buildRecentList } from './recentListModel';
import { renderRecentListView, type RecentListViewHandle } from './recentListView';

export type LandingTabId = 'home' | 'history' | 'profile' | 'library';

export interface HomeLandingViewDeps {
	app: App;
	services: PluginServices;
	getManifestStore: () => ManifestStore;
	onNavigate: (tab: LandingTabId) => void;
	onContinueSuccess: () => void;
	onStateChanged: () => void;
}

export interface HomeLandingViewHandle {
	refresh(): Promise<void>;
	destroy(): void;
}

function appendHeroBookSvg(parent: HTMLElement): void {
	const wrap = parent.createDiv({ cls: 'speed-reader-landing-hero__art-wrap' });
	wrap.createDiv({ cls: 'speed-reader-landing-hero__art-glow' });
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('class', 'speed-reader-landing-hero__art');
	svg.setAttribute('viewBox', '0 0 200 200');
	svg.innerHTML = `
<circle cx="50" cy="60" r="1.5" fill="#a78bfa" opacity="0.8"/>
<circle cx="160" cy="50" r="2" fill="#818cf8" opacity="0.9"/>
<circle cx="40" cy="120" r="2.5" fill="#f472b6" opacity="0.7"/>
<circle cx="140" cy="140" r="1.5" fill="#60a5fa" opacity="0.8"/>
<path d="M 10 130 Q 80 110 180 140" stroke="url(#srBlueGrad)" stroke-width="2" fill="none" opacity="0.6" stroke-linecap="round"/>
<path d="M 20 150 Q 100 130 190 120" stroke="url(#srPurpleGrad)" stroke-width="1.5" fill="none" opacity="0.4" stroke-linecap="round"/>
<path d="M 100 125 C 80 100, 45 90, 20 100 C 20 80, 50 65, 100 80" fill="url(#srPageGradLeft)" opacity="0.9"/>
<path d="M 100 120 C 80 95, 45 85, 25 95 C 25 75, 50 60, 100 75" fill="url(#srPageGradLeft)" opacity="0.85"/>
<path d="M 100 115 C 80 90, 45 80, 30 90 C 30 70, 50 55, 100 70" fill="url(#srPageGradLeft)"/>
<path d="M 100 125 C 120 100, 155 90, 180 100 C 180 80, 150 65, 100 80" fill="url(#srPageGradRight)" opacity="0.9"/>
<path d="M 100 120 C 120 95, 155 85, 175 95 C 175 75, 150 60, 100 75" fill="url(#srPageGradRight)" opacity="0.85"/>
<path d="M 100 115 C 120 90, 155 80, 170 90 C 170 70, 150 55, 100 70" fill="url(#srPageGradRight)"/>
<path d="M 98 70 L 98 128 C 98 131, 102 131, 102 128 L 102 70 Z" fill="#818cf8"/>
<ellipse cx="100" cy="115" rx="55" ry="12" fill="url(#srCoreGlow)"/>
<text x="55" y="55" fill="#a78bfa" font-size="14" font-weight="bold" font-family="serif" opacity="0.8">A</text>
<text x="135" y="45" fill="#818cf8" font-size="12" font-weight="bold" font-family="serif" opacity="0.7">d</text>
<text x="155" y="85" fill="#f472b6" font-size="15" font-weight="bold" font-family="serif" opacity="0.6">G</text>
<text x="35" y="85" fill="#60a5fa" font-size="11" font-weight="bold" font-family="serif" opacity="0.7">θ</text>
<defs>
<linearGradient id="srPageGradLeft" x1="1" y1="1" x2="0" y2="0">
<stop offset="0%" stop-color="#ffffff"/><stop offset="40%" stop-color="#e2e8f0"/><stop offset="100%" stop-color="#8b5cf6"/>
</linearGradient>
<linearGradient id="srPageGradRight" x1="0" y1="1" x2="1" y2="0">
<stop offset="0%" stop-color="#ffffff"/><stop offset="40%" stop-color="#e2e8f0"/><stop offset="100%" stop-color="#3b82f6"/>
</linearGradient>
<linearGradient id="srPurpleGrad" x1="0" y1="0" x2="1" y2="0">
<stop offset="0%" stop-color="#a78bfa" stop-opacity="0"/><stop offset="50%" stop-color="#8b5cf6" stop-opacity="1"/><stop offset="100%" stop-color="#d946ef" stop-opacity="0"/>
</linearGradient>
<linearGradient id="srBlueGrad" x1="0" y1="0" x2="1" y2="0">
<stop offset="0%" stop-color="#60a5fa" stop-opacity="0"/><stop offset="50%" stop-color="#3b82f6" stop-opacity="1"/><stop offset="100%" stop-color="#06b6d4" stop-opacity="0"/>
</linearGradient>
<radialGradient id="srCoreGlow" cx="50%" cy="50%" r="50%">
<stop offset="0%" stop-color="#f43f5e" stop-opacity="0.8"/><stop offset="50%" stop-color="#8b5cf6" stop-opacity="0.3"/><stop offset="100%" stop-color="#0c0533" stop-opacity="0"/>
</radialGradient>
</defs>`;
	wrap.appendChild(svg);
}

function renderStaticStatsRow(parent: HTMLElement, onNavigate: (tab: LandingTabId) => void): void {
	const row = parent.createDiv({ cls: 'speed-reader-landing-stats-row' });

	const streak = row.createDiv({ cls: 'speed-reader-landing-streak-card', attr: { 'aria-hidden': 'true' } });
	const streakMeta = streak.createDiv({ cls: 'speed-reader-landing-streak-card__meta' });
	const streakValue = streakMeta.createDiv({ cls: 'speed-reader-landing-streak-card__value' });
	streakValue.createSpan({ text: '7' });
	streakValue.createSpan({ cls: 'speed-reader-landing-streak-card__unit', text: 'Days' });
	streakMeta.createDiv({ cls: 'speed-reader-landing-streak-card__hint', text: 'Keep it up!' });

	const week = row.createDiv({ cls: 'speed-reader-landing-week-card', attr: { 'aria-hidden': 'true' } });
	const weekHeader = week.createDiv({ cls: 'speed-reader-landing-week-card__header' });
	weekHeader.createSpan({ cls: 'speed-reader-landing-week-card__label', text: 'This week' });
	const weekNav = weekHeader.createEl('button', {
		cls: 'speed-reader-landing-week-card__nav',
		attr: { type: 'button' },
		text: 'Stats →'
	});
	weekNav.addEventListener('click', () => onNavigate('history'));

	const days = week.createDiv({ cls: 'speed-reader-landing-week-card__days' });
	const dayStates = ['done', 'done', 'done', 'done', 'done', 'active', 'empty'] as const;
	const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
	for (let i = 0; i < dayLabels.length; i++) {
		const col = days.createDiv({ cls: 'speed-reader-landing-week-card__day' });
		col.createSpan({
			cls: `speed-reader-landing-week-card__day-label${
				dayStates[i] === 'active' ? ' is-active' : ''
			}`,
			text: dayLabels[i]
		});
		col.createDiv({
			cls: `speed-reader-landing-week-card__dot is-${dayStates[i]}`
		});
	}
}

export function renderHomeLandingView(
	container: HTMLElement,
	deps: HomeLandingViewDeps
): HomeLandingViewHandle {
	const { app, services, getManifestStore, onNavigate, onContinueSuccess, onStateChanged } = deps;

	const root = container.createDiv({ cls: 'speed-reader-landing-home' });

	const hero = root.createDiv({ cls: 'speed-reader-landing-hero' });
	const heroGrid = hero.createDiv({ cls: 'speed-reader-landing-hero__grid' });
	const heroCopy = heroGrid.createDiv({ cls: 'speed-reader-landing-hero__copy' });
	heroCopy.createEl('h1', {
		cls: 'speed-reader-landing-hero__title',
		text: 'Read Faster. Retain More.'
	});
	heroCopy.createEl('p', {
		cls: 'speed-reader-landing-hero__tagline',
		text: '"Train your eyes. Unlock your reading potential."'
	});

	const startBtn = heroCopy.createEl('button', {
		cls: 'speed-reader-landing-hero__start',
		attr: { type: 'button' }
	});
	const startIconWrap = startBtn.createDiv({ cls: 'speed-reader-landing-hero__start-icon' });
	setIcon(startIconWrap, 'play');
	const startText = startBtn.createDiv({ cls: 'speed-reader-landing-hero__start-text' });
	startText.createDiv({ cls: 'speed-reader-landing-hero__start-label', text: 'Start Reading' });
	const startSubtitle = startText.createSpan({
		cls: 'speed-reader-landing-hero__start-sub',
		text: 'Resume last session'
	});

	startBtn.addEventListener('click', () => {
		void continueReading({ app, services }).then((ok) => {
			if (ok) {
				onContinueSuccess();
			}
		});
	});

	const heroArt = heroGrid.createDiv({ cls: 'speed-reader-landing-hero__art-col' });
	appendHeroBookSvg(heroArt);

	renderStaticStatsRow(root, onNavigate);

	const sectionHeader = root.createDiv({ cls: 'speed-reader-landing-section-header' });
	sectionHeader.createEl('h2', { text: 'Continue & Recent' });

	const seeAllBtn = sectionHeader.createEl('button', {
		cls: 'speed-reader-landing-section-header__link',
		attr: { type: 'button' },
		text: 'See all →'
	});
	seeAllBtn.addEventListener('click', () => onNavigate('library'));

	const recentHost = root.createDiv({ cls: 'speed-reader-landing-recent-host' });
	const recentList = renderRecentListView(recentHost, {
		app,
		services,
		onStateChanged
	});

	async function refresh(): Promise<void> {
		const target = await resolveContinueReadingTarget({ app, services });
		startBtn.disabled = target === null;
		if (target) {
			const truncated =
				target.state.title.length > 28
					? `${target.state.title.slice(0, 25)}…`
					: target.state.title;
			startSubtitle.setText(`Resume: ${truncated}`);
			startBtn.setAttr('title', `Resume ${target.state.title}`);
		} else {
			startSubtitle.setText('No session in progress');
			startBtn.setAttr('title', 'No recent reading session.');
		}

		const rows = await buildRecentList({ services, getManifestStore });
		recentList.refresh(rows);
	}

	void refresh();

	return {
		refresh,
		destroy: () => {
			recentList.destroy();
			container.empty();
		}
	};
}
