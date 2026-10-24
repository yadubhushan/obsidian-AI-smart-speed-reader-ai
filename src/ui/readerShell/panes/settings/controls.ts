/**
 * Generic form controls for the in-reader settings pane. Each builder renders
 * one labeled row and reports changes through a callback; none of them know
 * about settings, persistence or other rows.
 */

const PREFIX = 'speed-reader-ai-settings';

export interface ControlHandle {
	el: HTMLElement;
	setVisible(visible: boolean): void;
}

export interface ValueControlHandle<T> extends ControlHandle {
	setValue(value: T): void;
}

export interface SegmentOption<T extends string> {
	value: T;
	label: string;
}

let nextControlId = 0;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function visibilityOf(el: HTMLElement): (visible: boolean) => void {
	return (visible) => el.toggleClass('is-hidden', !visible);
}

function row(
	parent: HTMLElement,
	label: string,
	options: { stacked?: boolean; hint?: string } = {}
): { rowEl: HTMLElement; control: HTMLElement; controlId: string } {
	const controlId = `speed-reader-ai-setting-${++nextControlId}`;
	const rowEl = parent.createDiv({
		cls: `${PREFIX}-row${options.stacked ? ' is-stacked' : ''}`
	});
	const text = rowEl.createDiv({ cls: `${PREFIX}-row-text` });
	text.createEl('label', { cls: `${PREFIX}-row-label`, text: label, attr: { for: controlId } });
	if (options.hint) {
		text.createDiv({ cls: `${PREFIX}-row-hint`, text: options.hint });
	}
	const control = rowEl.createDiv({ cls: `${PREFIX}-row-control` });
	return { rowEl, control, controlId };
}

/** A titled card that groups related rows. Returns the card body. */
export function card(parent: HTMLElement, title: string): HTMLElement {
	const section = parent.createEl('section', { cls: `${PREFIX}-card` });
	section.createEl('h4', { cls: `${PREFIX}-card-title`, text: title });
	return section;
}

export function switchRow(
	parent: HTMLElement,
	label: string,
	checked: boolean,
	onChange: (checked: boolean) => void
): ValueControlHandle<boolean> {
	const { rowEl, control, controlId } = row(parent, label);
	const input = control.createEl('input', {
		cls: `${PREFIX}-switch`,
		attr: { type: 'checkbox', role: 'switch', id: controlId }
	});
	input.checked = checked;
	input.addEventListener('change', () => onChange(input.checked));
	return {
		el: rowEl,
		setVisible: visibilityOf(rowEl),
		setValue: (value) => {
			input.checked = value;
		}
	};
}

export function stepper(
	parent: HTMLElement,
	label: string,
	config: { value: number; min: number; max: number; step: number; suffix?: string },
	onChange: (value: number) => void
): ValueControlHandle<number> {
	const { rowEl, control, controlId } = row(parent, label);
	const wrap = control.createDiv({ cls: `${PREFIX}-stepper` });
	const minus = wrap.createEl('button', {
		cls: `${PREFIX}-stepper-btn`,
		text: '−',
		attr: { type: 'button', 'aria-label': `Decrease ${label.toLowerCase()}` }
	});
	const input = wrap.createEl('input', {
		cls: `${PREFIX}-stepper-input`,
		attr: {
			type: 'number',
			id: controlId,
			min: String(config.min),
			max: String(config.max),
			step: String(config.step),
			inputmode: 'numeric'
		}
	});
	if (config.suffix) {
		wrap.createSpan({ cls: `${PREFIX}-stepper-suffix`, text: config.suffix });
	}
	const plus = wrap.createEl('button', {
		cls: `${PREFIX}-stepper-btn`,
		text: '+',
		attr: { type: 'button', 'aria-label': `Increase ${label.toLowerCase()}` }
	});

	let current = clamp(config.value, config.min, config.max);
	input.value = String(current);
	const commit = (value: number) => {
		const next = clamp(Number.isFinite(value) ? Math.round(value) : current, config.min, config.max);
		input.value = String(next);
		if (next !== current) {
			current = next;
			onChange(next);
		}
	};
	minus.addEventListener('click', () => commit(current - config.step));
	plus.addEventListener('click', () => commit(current + config.step));
	input.addEventListener('change', () => commit(Number(input.value)));

	return {
		el: rowEl,
		setVisible: visibilityOf(rowEl),
		setValue: (value) => {
			current = clamp(value, config.min, config.max);
			input.value = String(current);
		}
	};
}

export function slider(
	parent: HTMLElement,
	label: string,
	config: { value: number; min: number; max: number; step?: number; suffix?: string },
	onChange: (value: number) => void
): ValueControlHandle<number> & { control: HTMLElement } {
	const { rowEl, control, controlId } = row(parent, label, { stacked: true });
	const wrap = control.createDiv({ cls: `${PREFIX}-slider` });
	const input = wrap.createEl('input', {
		cls: `${PREFIX}-slider-input`,
		attr: {
			type: 'range',
			id: controlId,
			min: String(config.min),
			max: String(config.max),
			step: String(config.step ?? 1)
		}
	});
	const output = wrap.createSpan({ cls: `${PREFIX}-slider-value` });
	const show = (value: number) => {
		input.value = String(value);
		output.setText(`${value}${config.suffix ?? ''}`);
	};
	show(clamp(config.value, config.min, config.max));
	input.addEventListener('input', () => {
		const value = Number(input.value);
		show(value);
		onChange(value);
	});

	return {
		el: rowEl,
		control: wrap,
		setVisible: visibilityOf(rowEl),
		setValue: (value) => show(clamp(value, config.min, config.max))
	};
}

export function segmented<T extends string>(
	parent: HTMLElement,
	label: string,
	options: readonly SegmentOption<T>[],
	value: T,
	onChange: (value: T) => void
): ValueControlHandle<T> {
	const { rowEl, control, controlId } = row(parent, label, { stacked: true });
	const group = control.createDiv({
		cls: `${PREFIX}-segmented`,
		attr: { role: 'radiogroup', id: controlId, 'aria-label': label }
	});
	const buttons = options.map((option) => {
		const button = group.createEl('button', {
			cls: `${PREFIX}-segment`,
			text: option.label,
			attr: { type: 'button', role: 'radio', 'data-value': option.value }
		});
		button.addEventListener('click', () => {
			if (button.hasClass('is-active')) {
				return;
			}
			select(option.value);
			onChange(option.value);
		});
		return button;
	});
	const select = (next: T) => {
		for (const button of buttons) {
			const active = button.dataset.value === next;
			button.toggleClass('is-active', active);
			button.setAttr('aria-checked', String(active));
		}
	};
	select(value);

	return { el: rowEl, setVisible: visibilityOf(rowEl), setValue: select };
}

export function selectRow<T extends string>(
	parent: HTMLElement,
	label: string,
	options: readonly SegmentOption<T>[],
	value: T,
	onChange: (value: T) => void
): ValueControlHandle<T> {
	const { rowEl, control, controlId } = row(parent, label);
	const select = control.createEl('select', {
		cls: `${PREFIX}-select`,
		attr: { id: controlId }
	});
	for (const option of options) {
		select.createEl('option', { text: option.label, value: option.value });
	}
	select.value = value;
	select.addEventListener('change', () => onChange(select.value as T));
	return {
		el: rowEl,
		setVisible: visibilityOf(rowEl),
		setValue: (next) => {
			select.value = next;
		}
	};
}
