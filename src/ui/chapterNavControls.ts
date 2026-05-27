import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { RSVPEngine } from '../engine/rsvpEngine';
import type { ReaderState } from '../types';
import { appendM4IconToButton, createM4Icon } from './readerShell/m4/m4Icons';

export interface ChapterNavControlsHandle {
	destroy(): void;
	refresh(): void;
	updateFromState(state: ReaderState | null): void;
	setVisible(visible: boolean): void;
}

export interface ChapterNavHandlers {
	onPrevChapter: () => void;
	onNextChapter: () => void;
	onJumpToChapter: (chapterId: string) => void;
}

export interface ChapterNavControlsOptions {
	m4Style?: boolean;
}

export function mountChapterNavControls(
	container: HTMLElement,
	engine: RSVPEngine,
	handlers: ChapterNavHandlers,
	options: ChapterNavControlsOptions = {}
): ChapterNavControlsHandle {
	const m4 = options.m4Style ?? false;
	const row = container.createDiv({
		cls: m4
			? 'speed-reader-ai-section-nav-row speed-reader-m4-section-nav'
			: 'speed-reader-ai-section-nav-row'
	});

	const prevBtn = row.createEl('button', {
		cls: m4 ? 'speed-reader-m4-nav-btn' : 'speed-reader-ai-btn speed-reader-ai-btn-secondary',
		attr: {
			type: 'button',
			'aria-label': 'Previous chapter',
			...(m4 ? {} : { text: 'Prev chapter' })
		}
	});
	if (m4) {
		appendM4IconToButton(prevBtn, ChevronLeft, { size: 16 });
	}

	const counter = row.createSpan({
		cls: m4 ? 'speed-reader-m4-section-nav__counter' : 'speed-reader-ai-section-counter'
	});

	const nextBtn = row.createEl('button', {
		cls: m4 ? 'speed-reader-m4-nav-btn' : 'speed-reader-ai-btn speed-reader-ai-btn-secondary',
		attr: {
			type: 'button',
			'aria-label': 'Next chapter',
			...(m4 ? {} : { text: 'Next chapter' })
		}
	});
	if (m4) {
		appendM4IconToButton(nextBtn, ChevronRight, { size: 16 });
	}

	const pickerWrap = row.createDiv({
		cls: m4 ? 'speed-reader-m4-section-nav__picker' : 'speed-reader-ai-section-picker-wrap'
	});
	if (m4) {
		pickerWrap.appendChild(
			createM4Icon(ChevronDown, {
				className: 'speed-reader-m4-icon speed-reader-m4-section-nav__picker-icon',
				size: 12
			})
		);
	}
	const picker = pickerWrap.createEl('select', {
		cls: m4 ? 'speed-reader-m4-section-nav__select' : 'speed-reader-ai-section-picker'
	});
	picker.createEl('option', { text: 'Jump to chapter', value: '' });

	const onPrev = () => handlers.onPrevChapter();
	const onNext = () => handlers.onNextChapter();
	const onPicker = () => {
		const value = picker.value;
		if (!value) return;
		handlers.onJumpToChapter(value);
		picker.value = '';
	};

	prevBtn.addEventListener('click', onPrev);
	nextBtn.addEventListener('click', onNext);
	picker.addEventListener('change', onPicker);

	const refreshPicker = () => {
		const current = picker.value;
		picker.empty();
		picker.createEl('option', { text: 'Jump to chapter', value: '' });
		for (const section of engine.getSectionList()) {
			picker.createEl('option', {
				text: section.title,
				value: section.id
			});
		}
		if (current) {
			picker.value = current;
		}
	};

	return {
		destroy() {
			prevBtn.removeEventListener('click', onPrev);
			nextBtn.removeEventListener('click', onNext);
			picker.removeEventListener('change', onPicker);
			row.remove();
		},
		refresh() {
			refreshPicker();
		},
		updateFromState(state: ReaderState | null) {
			if (!state || state.sectionCount === undefined || state.sectionCount === 0) {
				counter.setText('');
				return;
			}
			const n = (state.currentSectionIndex ?? 0) + 1;
			const m = state.sectionCount;
			const title = state.sectionTitle?.trim() ?? '';
			counter.setText(title ? `Chapter ${n}/${m} · ${title}` : `Chapter ${n}/${m}`);
		},
		setVisible(visible: boolean) {
			row.toggleClass('is-hidden', !visible);
		}
	};
}
