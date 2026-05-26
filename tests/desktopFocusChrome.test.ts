import { describe, expect, it, vi } from 'vitest';
import {
	applyDesktopFocusChrome,
	captureSidebarSnapshot,
	collapseSidebarsForFocus,
	restoreSidebarsFromSnapshot,
	type SidebarSnapshot
} from '../src/ui/readerShell/desktopFocusChrome';

function mockSidedock(collapsed: boolean) {
	return {
		collapsed,
		collapse: vi.fn(function (this: { collapsed: boolean }) {
			this.collapsed = true;
		}),
		expand: vi.fn(function (this: { collapsed: boolean }) {
			this.collapsed = false;
		})
	};
}

function mockWorkspace(leftCollapsed: boolean, rightCollapsed: boolean) {
	const left = mockSidedock(leftCollapsed);
	const right = mockSidedock(rightCollapsed);
	return {
		leftSplit: left,
		rightSplit: right
	} as unknown as import('obsidian').Workspace;
}

describe('captureSidebarSnapshot', () => {
	it('records collapsed state of both splits', () => {
		const ws = mockWorkspace(false, true);
		expect(captureSidebarSnapshot(ws)).toEqual({
			leftCollapsed: false,
			rightCollapsed: true
		});
	});
});

describe('collapseSidebarsForFocus', () => {
	it('collapses expanded sidebars and returns prior state', () => {
		const ws = mockWorkspace(false, false);
		const snapshot = collapseSidebarsForFocus(ws);
		expect(snapshot).toEqual({ leftCollapsed: false, rightCollapsed: false });
		expect(ws.leftSplit.collapsed).toBe(true);
		expect(ws.rightSplit.collapsed).toBe(true);
	});

	it('does not call collapse on already-collapsed splits', () => {
		const ws = mockWorkspace(true, false);
		const left = ws.leftSplit as ReturnType<typeof mockSidedock>;
		const right = ws.rightSplit as ReturnType<typeof mockSidedock>;
		collapseSidebarsForFocus(ws);
		expect(left.collapse).not.toHaveBeenCalled();
		expect(right.collapse).toHaveBeenCalled();
	});
});

describe('restoreSidebarsFromSnapshot', () => {
	it('expands only splits that were expanded before focus', () => {
		const ws = mockWorkspace(true, true);
		const left = ws.leftSplit as ReturnType<typeof mockSidedock>;
		const right = ws.rightSplit as ReturnType<typeof mockSidedock>;
		const snapshot: SidebarSnapshot = { leftCollapsed: false, rightCollapsed: true };
		restoreSidebarsFromSnapshot(ws, snapshot);
		expect(left.expand).toHaveBeenCalled();
		expect(right.expand).not.toHaveBeenCalled();
	});

	it('no-ops when snapshot is null', () => {
		const ws = mockWorkspace(true, true);
		const left = ws.leftSplit as ReturnType<typeof mockSidedock>;
		restoreSidebarsFromSnapshot(ws, null);
		expect(left.expand).not.toHaveBeenCalled();
	});
});

describe('applyDesktopFocusChrome', () => {
	it('returns snapshot on enter and null on exit with restore', () => {
		const ws = mockWorkspace(false, true);
		const snapshot = applyDesktopFocusChrome(ws, true, null);
		expect(snapshot).toEqual({ leftCollapsed: false, rightCollapsed: true });
		expect(ws.leftSplit.collapsed).toBe(true);

		const left = ws.leftSplit as ReturnType<typeof mockSidedock>;
		applyDesktopFocusChrome(ws, false, snapshot);
		expect(left.expand).toHaveBeenCalled();
		expect(applyDesktopFocusChrome(ws, false, snapshot)).toBe(null);
	});

	it('restore is idempotent when snapshot already cleared', () => {
		const ws = mockWorkspace(false, false);
		const snapshot = applyDesktopFocusChrome(ws, true, null);
		applyDesktopFocusChrome(ws, false, snapshot);
		const left = ws.leftSplit as ReturnType<typeof mockSidedock>;
		left.expand.mockClear();
		applyDesktopFocusChrome(ws, false, null);
		expect(left.expand).not.toHaveBeenCalled();
	});
});
