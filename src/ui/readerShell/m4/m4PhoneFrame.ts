export interface M4PhoneFrameHandle {
	getInnerEl(): HTMLElement;
	destroy(): void;
}

export function mountM4PhoneFrame(
	container: HTMLElement,
	isMobile: boolean
): M4PhoneFrameHandle {
	const frame = container.createDiv({
		cls: `speed-reader-m4-phone-frame${isMobile ? ' is-mobile' : ''}`
	});
	const inner = frame.createDiv({ cls: 'speed-reader-m4-phone-frame__inner' });

	return {
		getInnerEl() {
			return inner;
		},
		destroy() {
			frame.remove();
		}
	};
}
