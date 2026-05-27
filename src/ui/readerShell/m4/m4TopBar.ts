import { ChevronDown, ChevronLeft, MoreHorizontal } from 'lucide-react';
import { appendM4IconToButton, createM4Icon } from './m4Icons';

export interface M4TopBarHandle {
	setChapterLabel(text: string): void;
	setProgressLabel(text: string): void;
	destroy(): void;
}

export interface M4TopBarOptions {
	onChapterPillTap: () => void;
	onClose: () => void;
	onOverflow: () => void;
}

export function mountM4TopBar(container: HTMLElement, options: M4TopBarOptions): M4TopBarHandle {
	const bar = container.createDiv({ cls: 'speed-reader-m4-top-bar speed-reader-m4-chrome' });
	const row = bar.createDiv({ cls: 'speed-reader-m4-top-bar__row' });

	const backBtn = row.createEl('button', {
		cls: 'speed-reader-m4-top-btn',
		attr: { type: 'button', 'aria-label': 'Close reader' }
	});
	appendM4IconToButton(backBtn, ChevronLeft);
	backBtn.addEventListener('click', () => options.onClose());

	const pill = row.createEl('button', {
		cls: 'speed-reader-m4-chapter-pill',
		attr: { type: 'button' }
	});
	const progressSpan = pill.createSpan({ cls: 'speed-reader-m4-chapter-pill__progress' });
	progressSpan.setText('—');
	pill.createSpan({ text: '•', cls: 'speed-reader-m4-chapter-pill__dot' });
	const chapterSpan = pill.createSpan({ cls: 'speed-reader-m4-chapter-pill__chapter' });
	chapterSpan.setText('Chapter');
	pill.appendChild(
		createM4Icon(ChevronDown, {
			className: 'speed-reader-m4-icon speed-reader-m4-chapter-pill__chevron',
			size: 12
		})
	);
	pill.addEventListener('click', () => options.onChapterPillTap());

	const overflowBtn = row.createEl('button', {
		cls: 'speed-reader-m4-top-btn',
		attr: { type: 'button', 'aria-label': 'More options' }
	});
	appendM4IconToButton(overflowBtn, MoreHorizontal);
	overflowBtn.addEventListener('click', () => options.onOverflow());

	bar.createSpan({ text: 'Speed Reader RSVP', cls: 'speed-reader-m4-top-bar__brand' });

	return {
		setChapterLabel(text: string) {
			chapterSpan.setText(text);
		},
		setProgressLabel(text: string) {
			progressSpan.setText(text);
		},
		destroy() {
			bar.remove();
		}
	};
}
