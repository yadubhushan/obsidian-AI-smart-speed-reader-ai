import { getDocumentProcessor } from '../prepare/documentProcessorRegistry';
import type { PrepareVersionEntry } from '../types/processedDocument';

export interface VersionPickerHandle {
	destroy(): void;
	setValue(versionId: string): void;
	refresh(versions: PrepareVersionEntry[]): void;
	setVisible(visible: boolean): void;
}

export function formatVersionLabel(entry: PrepareVersionEntry): string {
	const processor = getDocumentProcessor(entry.modeId);
	const staleSuffix = entry.status === 'stale' ? ' (stale)' : '';
	return `V${entry.number} — ${processor.label}${staleSuffix}`;
}

export function mountVersionPicker(
	container: HTMLElement,
	versions: PrepareVersionEntry[],
	activeVersionId: string | null,
	onChange: (versionId: string) => void | Promise<void>
): VersionPickerHandle {
	const row = container.createDiv({ cls: 'speed-reader-ai-version-row' });
	row.createSpan({ cls: 'speed-reader-ai-version-label', text: 'AI version:' });

	const select = row.createEl('select', { cls: 'speed-reader-ai-version-select' });

	const renderOptions = (entries: PrepareVersionEntry[]) => {
		select.empty();
		for (const entry of entries) {
			select.createEl('option', {
				text: formatVersionLabel(entry),
				value: entry.id
			});
		}
		if (entries.length > 0) {
			const active =
				entries.find((e) => e.id === activeVersionId)?.id ?? entries[0]?.id ?? '';
			select.value = active;
		}
	};

	renderOptions(versions);

	const handler = () => {
		const versionId = select.value;
		if (versionId) {
			void onChange(versionId);
		}
	};
	select.addEventListener('change', handler);

	return {
		destroy() {
			select.removeEventListener('change', handler);
			row.remove();
		},
		setValue(versionId: string) {
			select.value = versionId;
		},
		refresh(entries: PrepareVersionEntry[]) {
			renderOptions(entries);
		},
		setVisible(visible: boolean) {
			row.toggleClass('is-hidden', !visible);
		}
	};
}
