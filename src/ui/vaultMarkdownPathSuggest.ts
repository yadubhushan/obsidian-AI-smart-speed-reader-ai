import { AbstractInputSuggest, App, TFile, TFolder } from 'obsidian';

export class VaultMarkdownPathSuggest extends AbstractInputSuggest<string> {
	private readonly inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(inputStr: string): string[] {
		const query = inputStr.trim().toLowerCase();
		const paths = new Set<string>();

		for (const file of this.app.vault.getAllLoadedFiles()) {
			if (file instanceof TFile && file.extension === 'md') {
				if (!query || file.path.toLowerCase().includes(query)) {
					paths.add(file.path);
				}
				continue;
			}

			if (file instanceof TFolder) {
				const folderPath = file.path.length === 0 ? '' : file.path;
				const displayPath = folderPath.length === 0 ? '' : `${folderPath}/`;
				if (!query || displayPath.toLowerCase().includes(query) || folderPath.toLowerCase().includes(query)) {
					paths.add(displayPath);
				}
			}
		}

		if (!query || 'dictionary.md'.includes(query)) {
			paths.add('dictionary.md');
		}

		return Array.from(paths)
			.sort((left, right) => left.localeCompare(right))
			.slice(0, 100);
	}

	renderSuggestion(item: string, el: HTMLElement): void {
		el.setText(item || '/');
	}

	selectSuggestion(item: string): void {
		this.setValue(item);
		this.inputEl.dispatchEvent(new Event('input'));
		this.close();
	}
}
