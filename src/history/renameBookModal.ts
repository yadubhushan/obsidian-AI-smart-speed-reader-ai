import { Modal, Setting, type App } from 'obsidian';

export interface RenameBookInput {
	title: string;
	author?: string;
	originalTitle: string;
	originalAuthor?: string;
	hasCustomTitle: boolean;
}

/** `null` = cancelled; empty strings = reset to the EPUB's own title/author. */
export type RenameBookResult = { title: string; author: string } | null;

class RenameBookModal extends Modal {
	private resolved = false;
	private title: string;
	private author: string;

	constructor(
		app: App,
		private readonly input: RenameBookInput,
		private readonly resolveResult: (result: RenameBookResult) => void
	) {
		super(app);
		this.title = input.title;
		this.author = input.author ?? '';
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass('srai-lib-dialog');
		contentEl.empty();
		this.titleEl.setText('Rename book');
		contentEl.createEl('p', {
			cls: 'srai-lib-dialog__hint',
			text: 'Changes how the book appears in your library. The EPUB file is not renamed.'
		});

		new Setting(contentEl).setName('Title').addText((text) => {
			text.setPlaceholder(this.input.originalTitle).setValue(this.title);
			text.inputEl.addClass('srai-lib-dialog__input');
			text.onChange((value) => {
				this.title = value;
			});
			text.inputEl.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					this.save();
				}
			});
			window.setTimeout(() => text.inputEl.select(), 0);
		});

		new Setting(contentEl).setName('Author').addText((text) => {
			text.setPlaceholder(this.input.originalAuthor ?? 'Unknown').setValue(this.author);
			text.inputEl.addClass('srai-lib-dialog__input');
			text.onChange((value) => {
				this.author = value;
			});
		});

		const footer = new Setting(contentEl);
		if (this.input.hasCustomTitle) {
			footer.addButton((button) =>
				button.setButtonText('Reset to original').onClick(() => {
					this.finish({ title: '', author: '' });
				})
			);
		}
		footer
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.finish(null)))
			.addButton((button) => button.setButtonText('Save').setCta().onClick(() => this.save()));
	}

	onClose(): void {
		this.contentEl.empty();
		this.finish(null);
	}

	private save(): void {
		const title = this.title.trim();
		const author = this.author.trim();
		// Store only what differs from the original so metadata fixes still flow through.
		this.finish({
			title: title === this.input.originalTitle ? '' : title,
			author: author === (this.input.originalAuthor ?? '') ? '' : author
		});
	}

	private finish(result: RenameBookResult): void {
		if (this.resolved) {
			return;
		}
		this.resolved = true;
		this.resolveResult(result);
		this.close();
	}
}

export function promptRenameBook(app: App, input: RenameBookInput): Promise<RenameBookResult> {
	return new Promise((resolve) => {
		new RenameBookModal(app, input, resolve).open();
	});
}
