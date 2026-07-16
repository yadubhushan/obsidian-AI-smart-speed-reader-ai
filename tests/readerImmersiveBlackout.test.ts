import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
	READER_IMMERSIVE_BLACKOUT_BODY_CLASS,
	READER_IMMERSIVE_BLACKOUT_CONTAINER_CLASS,
	setReaderImmersiveBlackout
} from '../src/ui/readerShell/readerImmersiveBlackout';
import {
	removeMobileShellClass,
	syncMobilePlayingState
} from '../src/ui/readerShell/mobileLayout';

function addObsidianClassMethods(el: HTMLElement): void {
	const target = el as HTMLElement & {
		addClass(cls: string): void;
		removeClass(cls: string): void;
		toggleClass(cls: string, value?: boolean): void;
	};
	target.addClass = (cls: string) => el.classList.add(cls);
	target.removeClass = (cls: string) => el.classList.remove(cls);
	target.toggleClass = (cls: string, value?: boolean) => {
		el.classList.toggle(cls, value);
	};
}

function setupDom() {
	const dom = new JSDOM('<body><div id="modal"></div><div id="shell"></div></body>');
	const doc = dom.window.document;
	const modalContainerEl = doc.getElementById('modal') as HTMLElement;
	const shellEl = doc.getElementById('shell') as HTMLElement;
	addObsidianClassMethods(modalContainerEl);
	addObsidianClassMethods(shellEl);
	return { doc, modalContainerEl, shellEl };
}

describe('reader immersive blackout', () => {
	it('toggles scoped blackout classes on the modal container and body', () => {
		const { doc, modalContainerEl } = setupDom();

		setReaderImmersiveBlackout(doc, modalContainerEl, true);
		expect(doc.body.classList.contains(READER_IMMERSIVE_BLACKOUT_BODY_CLASS)).toBe(true);
		expect(modalContainerEl.classList.contains(READER_IMMERSIVE_BLACKOUT_CONTAINER_CLASS)).toBe(true);

		setReaderImmersiveBlackout(doc, modalContainerEl, false);
		expect(doc.body.classList.contains(READER_IMMERSIVE_BLACKOUT_BODY_CLASS)).toBe(false);
		expect(modalContainerEl.classList.contains(READER_IMMERSIVE_BLACKOUT_CONTAINER_CLASS)).toBe(false);
	});

	it('enables mobile blackout only while playing with no overlay open', () => {
		const { doc, modalContainerEl, shellEl } = setupDom();

		syncMobilePlayingState(shellEl, true, false, modalContainerEl);
		expect(shellEl.classList.contains('speed-reader-ai-mobile-playing')).toBe(true);
		expect(modalContainerEl.classList.contains('speed-reader-ai-mobile-playing')).toBe(true);
		expect(doc.body.classList.contains(READER_IMMERSIVE_BLACKOUT_BODY_CLASS)).toBe(true);
		expect(modalContainerEl.classList.contains(READER_IMMERSIVE_BLACKOUT_CONTAINER_CLASS)).toBe(true);

		syncMobilePlayingState(shellEl, true, true, modalContainerEl);
		expect(shellEl.classList.contains('speed-reader-ai-mobile-playing')).toBe(false);
		expect(shellEl.classList.contains('speed-reader-ai-mobile-menu-open')).toBe(true);
		expect(doc.body.classList.contains(READER_IMMERSIVE_BLACKOUT_BODY_CLASS)).toBe(false);
		expect(modalContainerEl.classList.contains(READER_IMMERSIVE_BLACKOUT_CONTAINER_CLASS)).toBe(false);

		syncMobilePlayingState(shellEl, false, false, modalContainerEl);
		expect(shellEl.classList.contains('speed-reader-ai-mobile-playing')).toBe(false);
		expect(doc.body.classList.contains(READER_IMMERSIVE_BLACKOUT_BODY_CLASS)).toBe(false);
		expect(modalContainerEl.classList.contains(READER_IMMERSIVE_BLACKOUT_CONTAINER_CLASS)).toBe(false);
	});

	it('cleans up blackout classes when mobile shell classes are removed', () => {
		const { doc, modalContainerEl, shellEl } = setupDom();
		syncMobilePlayingState(shellEl, true, false, modalContainerEl);

		removeMobileShellClass(shellEl, modalContainerEl);

		expect(shellEl.classList.contains('speed-reader-ai-mobile-playing')).toBe(false);
		expect(modalContainerEl.classList.contains('speed-reader-ai-mobile-playing')).toBe(false);
		expect(doc.body.classList.contains(READER_IMMERSIVE_BLACKOUT_BODY_CLASS)).toBe(false);
		expect(modalContainerEl.classList.contains(READER_IMMERSIVE_BLACKOUT_CONTAINER_CLASS)).toBe(false);
	});
});
