import type { SpeedReaderAiSettings } from '../../../types';
import { mountM4Settings } from '../../react/m4/mountM4Settings';

export interface M4SettingsViewHandle {
	refresh(settings: SpeedReaderAiSettings): void;
	destroy(): void;
}

export interface M4SettingsViewOptions {
	settings: SpeedReaderAiSettings;
	isMobile?: boolean;
	showGesturesGuide?: boolean;
	onSave: (settings: SpeedReaderAiSettings) => void;
	onDefaults: () => SpeedReaderAiSettings;
	onResetFontSize: () => void;
	onBack: () => void;
}

export function mountM4SettingsView(
	container: HTMLElement,
	options: M4SettingsViewOptions
): M4SettingsViewHandle {
	const host = container.createDiv({ cls: 'speed-reader-m4-settings-host' });

	let currentSettings = structuredClone(options.settings);

	const mountProps = () => ({
		settings: currentSettings,
		showGesturesGuide: options.showGesturesGuide,
		onSave: options.onSave,
		onDefaults: options.onDefaults,
		onResetFontSize: options.onResetFontSize,
		onBack: options.onBack
	});

	const reactMount = mountM4Settings(host, mountProps());

	return {
		refresh(next) {
			currentSettings = structuredClone(next);
			reactMount.refresh(mountProps());
		},
		destroy() {
			reactMount.destroy();
			host.remove();
		}
	};
}
