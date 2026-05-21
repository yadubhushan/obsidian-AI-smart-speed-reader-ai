import type { RSVPEngine } from '../engine/rsvpEngine';
import type { ReaderState } from '../types';

export interface ChapterNavControlsHandle {
	destroy(): void;
	refresh(): void;
	updateFromState(state: ReaderState | null): void;
	setVisible(visible: boolean): void;
}

export function mountChapterNavControls(
	container: HTMLElement,
	engine: RSVPEngine,
	onRefocus: () => void
): ChapterNavControlsHandle {
	const row = container.createDiv({ cls: 'speed-reader-ai-section-nav-row' });

	const prevBtn = row.createEl('button', {
		cls: 'speed-reader-ai-btn speed-reader-ai-btn-secondary',
		text: 'Prev chapter'
	});
	const counter = row.createSpan({ cls: 'speed-reader-ai-section-counter' });
	const nextBtn = row.createEl('button', {
		cls: 'speed-reader-ai-btn speed-reader-ai-btn-secondary',
		text: 'Next chapter'
	});

	const pickerWrap = row.createDiv({ cls: 'speed-reader-ai-section-picker-wrap' });
	const picker = pickerWrap.createEl('select', { cls: 'speed-reader-ai-section-picker' });
	picker.createEl('option', { text: 'Jump to chapter', value: '' });

	const onPrev = () => {
		engine.prevSection();
		onRefocus();
	};
	const onNext = () => {
		engine.nextSection();
		onRefocus();
	};
	const onPicker = () => {
		const value = picker.value;
		if (!value) return;
		engine.goToSection(value);
		picker.value = '';
		onRefocus();
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
