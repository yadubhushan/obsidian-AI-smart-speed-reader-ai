import type { RSVPEngineContext } from '../playbackStrategy';
import { RsvpStrategy } from './RsvpStrategy';
import { adjustRampWpm, advanceRampWpm, rampReadingMinutes } from '../rampRsvp';

/**
 * Word-by-word RSVP that warms up: starts at rampStartWpm and climbs to rampTargetWpm
 * over rampMinutes of reading. The ramp speed lives here, not in settings, so the saved
 * WPM used by other modes is untouched. Switching modes creates a fresh strategy,
 * which restarts the warm-up.
 */
export class RampRsvpStrategy extends RsvpStrategy {
	private rampWpm: number | null = null;

	getEffectiveWpm(ctx: RSVPEngineContext): number {
		if (this.rampWpm === null) {
			this.rampWpm = ctx.settings.reader.rampStartWpm;
		}
		return this.rampWpm;
	}

	adjustWpm(ctx: RSVPEngineContext, delta: number): number {
		this.rampWpm = adjustRampWpm(this.getEffectiveWpm(ctx), delta);
		return this.rampWpm;
	}

	calculateRemainingMs(ctx: RSVPEngineContext): number {
		const wpm = this.getEffectiveWpm(ctx);
		// Base estimate at today's speed, re-read as word-equivalents so micropauses still count.
		const wordEquivalents = super.calculateRemainingMs(ctx) / (60000 / wpm);
		return rampReadingMinutes(wordEquivalents, wpm, ctx.settings) * 60000;
	}

	protected onChunkShown(ctx: RSVPEngineContext, delayMs: number): void {
		this.rampWpm = advanceRampWpm(this.getEffectiveWpm(ctx), delayMs, ctx.settings);
	}

	protected getEffectiveChunkSize(_ctx: RSVPEngineContext): number {
		return 1;
	}
}
