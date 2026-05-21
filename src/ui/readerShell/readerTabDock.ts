export type ReaderTabId = 'home' | 'content' | 'settings' | 'shortcuts' | 'advanced';

export const READER_TABS: { id: ReaderTabId; label: string }[] = [
	{ id: 'home', label: 'Home' },
	{ id: 'content', label: 'Content' },
	{ id: 'settings', label: 'Settings' },
	{ id: 'shortcuts', label: 'Shortcuts' },
	{ id: 'advanced', label: 'Advanced' }
];

export interface ReaderTabDockHandle {
	destroy(): void;
	setActiveTab(tab: ReaderTabId): void;
	getActiveTab(): ReaderTabId;
	onTabChange(cb: (tab: ReaderTabId) => void): void;
}

const PREFERENCES_TABS = new Set<ReaderTabId>(['settings', 'shortcuts', 'advanced']);

export function mountReaderTabDock(
	container: HTMLElement,
	initialTab: ReaderTabId,
	onSelect: (tab: ReaderTabId) => void,
	options?: { preferencesOnly?: boolean }
): ReaderTabDockHandle {
	const dock = container.createDiv({ cls: 'speed-reader-ai-tab-dock' });
	let activeTab = initialTab;
	const listeners: Array<(tab: ReaderTabId) => void> = [onSelect];
	const buttons = new Map<ReaderTabId, HTMLButtonElement>();
	const visibleTabs = options?.preferencesOnly
		? READER_TABS.filter((tab) => PREFERENCES_TABS.has(tab.id))
		: READER_TABS;

	for (const tab of visibleTabs) {
		const btn = dock.createEl('button', {
			cls: `speed-reader-ai-tab-btn${tab.id === activeTab ? ' is-active' : ''}`,
			text: tab.label,
			attr: { type: 'button', 'data-tab': tab.id }
		});
		btn.addEventListener('click', () => {
			setActiveTab(tab.id);
		});
		buttons.set(tab.id, btn);
	}

	function setActiveTab(tab: ReaderTabId) {
		if (activeTab === tab) {
			return;
		}
		activeTab = tab;
		for (const [id, btn] of buttons) {
			btn.toggleClass('is-active', id === tab);
		}
		for (const listener of listeners) {
			listener(tab);
		}
	}

	return {
		destroy() {
			dock.remove();
		},
		setActiveTab,
		getActiveTab: () => activeTab,
		onTabChange(cb) {
			listeners.push(cb);
		}
	};
}
