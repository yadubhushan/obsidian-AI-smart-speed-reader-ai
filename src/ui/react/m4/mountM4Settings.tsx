import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { M4SettingsApp, type M4SettingsAppProps } from "./M4SettingsApp";

export interface M4SettingsMountHandle {
	refresh(props: M4SettingsAppProps): void;
	destroy(): void;
}

export function mountM4Settings(
	container: HTMLElement,
	props: M4SettingsAppProps
): M4SettingsMountHandle {
	const root: Root = createRoot(container);
	root.render(createElement(M4SettingsApp, props));

	return {
		refresh(nextProps: M4SettingsAppProps) {
			root.render(createElement(M4SettingsApp, nextProps));
		},
		destroy() {
			root.unmount();
		}
	};
}
