import type { RSVPEngine } from '../../engine/rsvpEngine';

export function getSectionPickerOptions(
	engine: RSVPEngine
): Array<{ id: string; title: string }> {
	const sections = engine.getSectionList();
	if (sections.length > 0) {
		return sections.map((s) => ({ id: s.id, title: s.title }));
	}
	const headings = engine.getStreamHeadings();
	if (headings.length > 0) {
		return headings.map((h) => ({ id: h.title, title: h.title }));
	}
	return engine.getHeadings().map((h) => ({
		id: String(h.wordIndex),
		title: `${'#'.repeat(h.level)} ${h.text}`
	}));
}
