import { setIcon, type App } from 'obsidian';
import type { ManifestStore } from '../../store/ManifestStore';
import type { PluginServices } from '../../services/serviceRegistry';
import type { HistoryFilterState } from '../historyFilters';
import {
	renderHomeLandingView,
	type HomeLandingViewHandle,
	type LandingTabId
} from './homeLandingView';
import { renderHistoryStatsView } from './historyStatsView';
import { renderProfileLandingView } from './profileLandingView';
import {
	createLibraryContext,
	renderLibraryLandingView,
	type LibraryLandingViewHandle
} from './libraryLandingView';

const NAV_ITEMS: { id: LandingTabId; label: string; icon: string }[] = [
	{ id: 'home', label: 'Home', icon: 'home' },
	{ id: 'history', label: 'History', icon: 'calendar' },
	{ id: 'profile', label: 'Profile', icon: 'user' },
	{ id: 'library', label: 'Library', icon: 'library' }
];

export type { LandingTabId };

export interface LandingShellDeps {
	app: App;
	services: PluginServices;
	getManifestStore: () => ManifestStore;
	onContinueSuccess: () => void;
}

export interface LandingShellHandle {
	switchTab(tab: LandingTabId): void;
	refresh(): Promise<void>;
	destroy(): void;
}

export function renderLandingShell(
	container: HTMLElement,
	deps: LandingShellDeps
): LandingShellHandle {
	const { app, services, getManifestStore, onContinueSuccess } = deps;

	const shell = container.createDiv({ cls: 'speed-reader-landing-shell' });
	const scrollHost = shell.createDiv({ cls: 'speed-reader-landing-scroll' });

	const pages = new Map<LandingTabId, HTMLElement>();
	for (const tab of NAV_ITEMS) {
		const page = scrollHost.createDiv({
			cls: `speed-reader-landing-page${tab.id === 'home' ? ' is-active' : ''}`,
			attr: { 'data-tab': tab.id }
		});
		pages.set(tab.id, page);
	}

	let activeTab: LandingTabId = 'home';
	let homeView: HomeLandingViewHandle | null = null;
	let libraryView: LibraryLandingViewHandle | null = null;
	let historyMounted = false;
	let profileMounted = false;

	const libraryContext = createLibraryContext(
		(next: HistoryFilterState) => {
			libraryContext.filters = next;
			libraryView?.syncFilterChips();
			libraryView?.refresh();
		},
		() => {
			void refreshAll();
		}
	);

	function mountHome(): void {
		if (homeView) {
			return;
		}
		const page = pages.get('home');
		if (!page) {
			return;
		}
		homeView = renderHomeLandingView(page, {
			app,
			services,
			getManifestStore,
			onNavigate: switchTab,
			onContinueSuccess,
			onStateChanged: () => void refreshAll()
		});
	}

	function mountHistory(): void {
		if (historyMounted) {
			return;
		}
		const page = pages.get('history');
		if (!page) {
			return;
		}
		renderHistoryStatsView(page);
		historyMounted = true;
	}

	function mountProfile(): void {
		if (profileMounted) {
			return;
		}
		const page = pages.get('profile');
		if (!page) {
			return;
		}
		renderProfileLandingView(page);
		profileMounted = true;
	}

	function mountLibrary(): void {
		if (libraryView) {
			return;
		}
		const page = pages.get('library');
		if (!page) {
			return;
		}
		libraryView = renderLibraryLandingView(page, {
			app,
			services,
			getManifestStore,
			context: libraryContext
		});
	}

	mountHome();

	const nav = shell.createDiv({ cls: 'speed-reader-landing-nav' });
	const navButtons = new Map<LandingTabId, HTMLButtonElement>();
	const navIndicators = new Map<LandingTabId, HTMLElement>();

	for (const item of NAV_ITEMS) {
		const btn = nav.createEl('button', {
			cls: `speed-reader-landing-nav__btn${
				item.id === activeTab ? ' is-active' : ''
			}`,
			attr: { type: 'button', 'data-tab': item.id }
		});
		const iconEl = btn.createSpan({ cls: 'speed-reader-landing-nav__icon' });
		setIcon(iconEl, item.icon);
		btn.createSpan({ cls: 'speed-reader-landing-nav__label', text: item.label });
		const indicator = btn.createSpan({ cls: 'speed-reader-landing-nav__indicator' });
		if (item.id !== activeTab) {
			indicator.addClass('is-hidden');
		}
		btn.addEventListener('click', () => switchTab(item.id));
		navButtons.set(item.id, btn);
		navIndicators.set(item.id, indicator);
	}

	function switchTab(tab: LandingTabId): void {
		if (tab === activeTab) {
			return;
		}
		activeTab = tab;

		for (const [id, page] of pages) {
			page.toggleClass('is-active', id === tab);
		}
		for (const [id, btn] of navButtons) {
			btn.toggleClass('is-active', id === tab);
		}
		for (const [id, indicator] of navIndicators) {
			indicator.toggleClass('is-hidden', id !== tab);
		}

		if (tab === 'home') {
			mountHome();
		} else if (tab === 'history') {
			mountHistory();
		} else if (tab === 'profile') {
			mountProfile();
		} else if (tab === 'library') {
			mountLibrary();
		}
	}

	async function refreshAll(): Promise<void> {
		await homeView?.refresh();
		libraryView?.refresh();
	}

	const unsubscribers = [
		services.eventBus.on('reading-state-changed', () => void refreshAll()),
		services.eventBus.on('epub-index-changed', () => void refreshAll()),
		services.eventBus.on('book-cache-updated', () => void refreshAll())
	];

	return {
		switchTab,
		refresh: refreshAll,
		destroy: () => {
			for (const unsub of unsubscribers) {
				unsub();
			}
			homeView?.destroy();
			libraryView?.destroy();
			container.empty();
		}
	};
}
