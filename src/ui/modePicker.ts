import { listDocumentProcessors } from '../prepare/documentProcessorRegistry';
import type { ProcessingModeId } from '../types/processedDocument';

export interface ModePickerHandle {
	destroy(): void;
	setValue(modeId: ProcessingModeId): void;
}

export function mountModePicker(
	container: HTMLElement,
	initialModeId: ProcessingModeId,
	onChange: (modeId: ProcessingModeId) => void | Promise<void>
): ModePickerHandle {
	const row = container.createDiv({ cls: 'speed-reader-ai-mode-row' });
	row.createSpan({ cls: 'speed-reader-ai-mode-label', text: 'Reading as:' });

	const select = row.createEl('select', { cls: 'speed-reader-ai-mode-select' });
	for (const processor of listDocumentProcessors()) {
		select.createEl('option', { text: processor.label, value: processor.id });
	}
	select.value = initialModeId;

	const handler = () => {
		const modeId = select.value as ProcessingModeId;
		void onChange(modeId);
	};
	select.addEventListener('change', handler);

	return {
		destroy() {
			select.removeEventListener('change', handler);
			row.remove();
		},
		setValue(modeId: ProcessingModeId) {
			select.value = modeId;
		}
	};
}
