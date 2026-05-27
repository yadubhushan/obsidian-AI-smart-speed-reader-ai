export function scrollContextLineIntoView(
	scrollContainer: HTMLElement,
	contextRoot: HTMLElement,
	smooth: boolean
): void {
	const current = contextRoot.querySelector('.is-current-line');
	if (!current) {
		return;
	}

	const containerRect = scrollContainer.getBoundingClientRect();
	const lineRect = current.getBoundingClientRect();
	const fullyVisible =
		lineRect.top >= containerRect.top && lineRect.bottom <= containerRect.bottom;

	if (fullyVisible) {
		return;
	}

	current.scrollIntoView({
		block: 'center',
		behavior: smooth ? 'smooth' : 'auto'
	});
}
