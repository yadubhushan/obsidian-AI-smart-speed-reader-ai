import { Workspace } from 'obsidian';

export type SidebarSnapshot = {
	leftCollapsed: boolean;
	rightCollapsed: boolean;
};

type CollapsibleSplit = {
	collapsed: boolean;
	collapse(): void;
	expand(): void;
};

function asSidedock(split: Workspace['leftSplit']): CollapsibleSplit | null {
	const candidate = split as CollapsibleSplit;
	if (
		candidate &&
		typeof candidate.collapsed === 'boolean' &&
		typeof candidate.collapse === 'function' &&
		typeof candidate.expand === 'function'
	) {
		return candidate;
	}
	return null;
}

export function captureSidebarSnapshot(workspace: Workspace): SidebarSnapshot {
	const left = asSidedock(workspace.leftSplit);
	const right = asSidedock(workspace.rightSplit);
	return {
		leftCollapsed: left?.collapsed ?? true,
		rightCollapsed: right?.collapsed ?? true
	};
}

export function collapseSidebarsForFocus(workspace: Workspace): SidebarSnapshot {
	const snapshot = captureSidebarSnapshot(workspace);
	const left = asSidedock(workspace.leftSplit);
	const right = asSidedock(workspace.rightSplit);
	if (left && !left.collapsed) {
		left.collapse();
	}
	if (right && !right.collapsed) {
		right.collapse();
	}
	return snapshot;
}

export function restoreSidebarsFromSnapshot(
	workspace: Workspace,
	snapshot: SidebarSnapshot | null
): void {
	if (!snapshot) {
		return;
	}
	const left = asSidedock(workspace.leftSplit);
	const right = asSidedock(workspace.rightSplit);
	if (left && !snapshot.leftCollapsed && left.collapsed) {
		left.expand();
	}
	if (right && !snapshot.rightCollapsed && right.collapsed) {
		right.expand();
	}
}

/**
 * Enter/exit desktop immersive focus workspace chrome.
 * Returns the snapshot to keep while focus is active, or null after restore.
 */
export function applyDesktopFocusChrome(
	workspace: Workspace,
	enabled: boolean,
	snapshot: SidebarSnapshot | null
): SidebarSnapshot | null {
	if (enabled) {
		return collapseSidebarsForFocus(workspace);
	}
	restoreSidebarsFromSnapshot(workspace, snapshot);
	return null;
}
