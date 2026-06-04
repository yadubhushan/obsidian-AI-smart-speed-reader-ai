export async function writeTextToClipboard(text: string, ownerDoc?: Document): Promise<void> {
	const clipboard = ownerDoc?.defaultView?.navigator?.clipboard ?? globalThis.navigator?.clipboard;
	if (clipboard?.writeText) {
		await clipboard.writeText(text);
		return;
	}

	const doc = ownerDoc ?? globalThis.document;
	if (!doc) {
		throw new Error('Clipboard unavailable');
	}

	const textArea = doc.createElement('textarea');
	textArea.value = text;
	textArea.setAttribute('readonly', 'true');
	textArea.style.position = 'fixed';
	textArea.style.opacity = '0';
	textArea.style.pointerEvents = 'none';
	textArea.style.left = '-9999px';
	textArea.style.top = '0';
	doc.body.appendChild(textArea);
	textArea.focus();
	textArea.select();

	try {
		const copied = doc.execCommand('copy');
		if (!copied) {
			throw new Error('Clipboard unavailable');
		}
	} finally {
		textArea.remove();
	}
}
