export const READER_IMMERSIVE_BLACKOUT_BODY_CLASS =
	'speed-reader-ai-immersive-blackout-body';
export const READER_IMMERSIVE_BLACKOUT_CONTAINER_CLASS =
	'speed-reader-ai-immersive-blackout';

export function setReaderImmersiveBlackout(
	doc: Document | null | undefined,
	modalContainerEl: HTMLElement | null | undefined,
	enabled: boolean
): void {
	doc?.body.classList.toggle(READER_IMMERSIVE_BLACKOUT_BODY_CLASS, enabled);
	modalContainerEl?.classList.toggle(READER_IMMERSIVE_BLACKOUT_CONTAINER_CLASS, enabled);
}
