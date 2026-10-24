export function installObsidianDomExtensions(): void {
	const proto = HTMLElement.prototype;
	proto.empty = function () {
		this.replaceChildren();
	};
	proto.setText = function (text: string) {
		this.textContent = text;
	};
	proto.setAttr = function (name: string, value: string) {
		this.setAttribute(name, value);
	};
	proto.addClass = function (...classes: string[]) {
		this.classList.add(...classes);
	};
	proto.removeClass = function (...classes: string[]) {
		this.classList.remove(...classes);
	};
	proto.toggleClass = function (className: string, value: boolean) {
		this.classList.toggle(className, value);
	};
	proto.hasClass = function (className: string) {
		return this.classList.contains(className);
	};
	proto.createEl = function <K extends keyof HTMLElementTagNameMap>(
		tag: K,
		options?: { cls?: string; text?: string; value?: string; attr?: Record<string, string> }
	): HTMLElementTagNameMap[K] {
		const element = document.createElement(tag);
		if (options?.cls) {
			element.className = options.cls;
		}
		if (options?.text !== undefined) {
			element.textContent = options.text;
		}
		if (options?.value !== undefined && 'value' in element) {
			element.value = options.value;
		}
		for (const [name, value] of Object.entries(options?.attr ?? {})) {
			element.setAttribute(name, value);
		}
		this.append(element);
		return element;
	};
	proto.createDiv = function (options?: { cls?: string; text?: string; value?: string; attr?: Record<string, string> }) {
		return this.createEl('div', options);
	};
	proto.createSpan = function (options?: { cls?: string; text?: string; value?: string; attr?: Record<string, string> }) {
		return this.createEl('span', options);
	};
}
