export function renderProfileLandingView(container: HTMLElement): void {
	const root = container.createDiv({ cls: 'speed-reader-landing-profile', attr: { 'aria-hidden': 'true' } });

	const hero = root.createDiv({ cls: 'speed-reader-landing-profile__hero' });
	const avatarRing = hero.createDiv({ cls: 'speed-reader-landing-profile__avatar-ring' });
	avatarRing.createDiv({ cls: 'speed-reader-landing-profile__avatar', text: 'JD' });
	hero.createEl('h2', { text: 'Jane Doe' });
	hero.createEl('p', { cls: 'speed-reader-landing-profile__subtitle', text: 'Premium Speed Reader' });

	const tier = root.createDiv({ cls: 'speed-reader-landing-profile__tier' });
	const tierCopy = tier.createDiv();
	tierCopy.createSpan({ cls: 'speed-reader-landing-profile__tier-label', text: 'Current Tier' });
	tierCopy.createSpan({
		cls: 'speed-reader-landing-profile__tier-name',
		text: 'Advanced Visualizer'
	});
	tier.createSpan({ cls: 'speed-reader-landing-profile__tier-level', text: 'Level 8 / 10' });
}
