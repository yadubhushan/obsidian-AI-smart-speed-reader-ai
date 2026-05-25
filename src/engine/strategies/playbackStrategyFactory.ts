import type { PlaybackMode } from '../../types';
import type { PlaybackStrategy } from '../playbackStrategy';
import { RsvpStrategy } from './RsvpStrategy';
import { ProgressiveRsvpStrategy } from './ProgressiveRsvpStrategy';
import { LineByLineStrategy } from './LineByLineStrategy';
import { LineRepeatStrategy } from './LineRepeatStrategy';

export function createPlaybackStrategy(mode: PlaybackMode): PlaybackStrategy {
	switch (mode) {
		case 'rsvp':
			return new RsvpStrategy();
		case 'progressiveRsvp':
			return new ProgressiveRsvpStrategy();
		case 'lineByLine':
			return new LineByLineStrategy();
		case 'lineRepeat':
			return new LineRepeatStrategy();
		default:
			return new RsvpStrategy();
	}
}
