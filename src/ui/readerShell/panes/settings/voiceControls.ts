const PREFIX = 'speed-reader-ai-settings';
const DEFAULT_STATUS = 'Voices are provided by this device.';

export interface VoiceControlsHandle {
	destroy(): void;
}

function getSynthesis(): SpeechSynthesis | null {
	return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/** Device voice picker with a preview button. Reports the chosen voice URI ('' = system default). */
export function mountVoiceControls(
	parent: HTMLElement,
	voiceUri: string,
	onChange: (voiceUri: string) => void
): VoiceControlsHandle {
	const rowEl = parent.createDiv({ cls: `${PREFIX}-row is-stacked` });
	const text = rowEl.createDiv({ cls: `${PREFIX}-row-text` });
	text.createEl('label', { cls: `${PREFIX}-row-label`, text: 'Voice' });
	const voiceStatus = text.createDiv({ cls: `${PREFIX}-row-hint`, text: DEFAULT_STATUS });
	const control = rowEl.createDiv({ cls: `${PREFIX}-row-control ${PREFIX}-voice` });
	const voiceSelect = control.createEl('select', {
		cls: `${PREFIX}-select`,
		attr: { 'aria-label': 'Text to speech voice' }
	});
	const testVoiceBtn = control.createEl('button', {
		cls: `${PREFIX}-ghost-btn`,
		text: 'Test',
		attr: { type: 'button' }
	});

	let selectedVoiceUri = voiceUri;
	const synthesis = getSynthesis();
	const populateVoices = () => {
		voiceSelect.empty();
		voiceSelect.createEl('option', { text: 'System default', value: '' });
		const voices = synthesis?.getVoices() ?? [];
		for (const voice of [...voices].sort((a, b) =>
			`${a.lang} ${a.name}`.localeCompare(`${b.lang} ${b.name}`)
		)) {
			voiceSelect.createEl('option', {
				text: `${voice.name} (${voice.lang})${voice.default ? ' — default' : ''}`,
				value: voice.voiceURI
			});
		}
		if (selectedVoiceUri && voices.some((voice) => voice.voiceURI === selectedVoiceUri)) {
			voiceSelect.value = selectedVoiceUri;
		} else {
			voiceSelect.value = '';
			if (selectedVoiceUri) {
				voiceStatus.setText('Saved voice is unavailable on this device; using the default.');
			}
		}
	};
	populateVoices();
	voiceSelect.addEventListener('change', () => {
		selectedVoiceUri = voiceSelect.value;
		voiceStatus.setText(DEFAULT_STATUS);
		onChange(selectedVoiceUri);
	});

	let removeVoicesChangedListener: (() => void) | null = null;
	if (synthesis) {
		const onVoicesChanged = () => populateVoices();
		synthesis.addEventListener('voiceschanged', onVoicesChanged);
		removeVoicesChangedListener = () =>
			synthesis.removeEventListener('voiceschanged', onVoicesChanged);
	} else {
		voiceSelect.disabled = true;
		voiceStatus.setText('Text to speech is unavailable on this device.');
	}

	testVoiceBtn.disabled = !synthesis;
	testVoiceBtn.addEventListener('click', () => {
		if (!synthesis) {
			return;
		}
		try {
			synthesis.cancel();
			const utterance = new SpeechSynthesisUtterance(
				'This is how the selected speed reader voice sounds.'
			);
			const selectedVoice = synthesis
				.getVoices()
				.find((voice) => voice.voiceURI === voiceSelect.value);
			if (selectedVoice) {
				utterance.voice = selectedVoice;
			}
			utterance.rate = 1;
			utterance.onerror = () => voiceStatus.setText('The selected voice could not be played.');
			utterance.onend = () => voiceStatus.setText('Voice preview finished.');
			synthesis.speak(utterance);
			voiceStatus.setText('Playing voice preview…');
		} catch {
			voiceStatus.setText('The selected voice could not be played.');
		}
	});

	return {
		destroy() {
			removeVoicesChangedListener?.();
		}
	};
}
