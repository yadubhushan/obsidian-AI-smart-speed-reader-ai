import { describe, expect, it } from 'vitest';
import { buildSectionTitlePrefix } from '../src/engine/sectionTitlePrefix';
import { RSVPEngine } from '../src/engine/rsvpEngine';
import { DEFAULT_SETTINGS } from '../src/types';
import { sampleSectionsProcessed } from './prepareFixtures';

describe('sectionTitlePrefix', () => {
	it('buildSectionTitlePrefix formats chapter and section labels', () => {
		expect(buildSectionTitlePrefix('Networking', 'Section')).toEqual({
			kind: 'section_break',
			text: 'Section : Networking'
		});
		expect(buildSectionTitlePrefix('Intro', 'Chapter')).toEqual({
			kind: 'section_break',
			text: 'Chapter : Intro'
		});
	});

	it('falls back to label when title is empty', () => {
		expect(buildSectionTitlePrefix('', 'Chapter').text).toBe('Chapter : Chapter');
	});
});

describe('RSVPEngine section title prefix', () => {
	it('prepends title token at section start and disables after mid-section seek', () => {
		const engine = new RSVPEngine(DEFAULT_SETTINGS, () => {}, () => {});
		engine.setSectionNavLabel('Section');
		engine.loadProcessedDocument(sampleSectionsProcessed(), { sectionIndex: 1, tokenIndex: 0 });

		const prefixStream = engine.getPlaybackStream();
		expect(prefixStream[0]).toEqual({
			kind: 'section_break',
			text: 'Section : Networking'
		});
		expect(prefixStream[1]).toEqual({ kind: 'word', text: 'VPC' });
		expect(engine.getBaseTokenIndex()).toBe(0);

		engine.seekToToken(0);
		expect(engine.getPlaybackStream()[0]?.text).toBe('Section : Networking');

		engine.seekToToken(0);
		engine.setCurrentTokenIndex(1);
		expect(engine.getBaseTokenIndex()).toBe(0);

		engine.seekToToken(0);
		engine.setCurrentTokenIndex(0);
		expect(engine.getPlaybackStream()[0]?.text).toBe('Section : Networking');
	});

	it('does not prepend prefix when resuming mid-section', () => {
		const processed = sampleSectionsProcessed();
		processed.sections[1]!.stream.push({ kind: 'word', text: 'Peering' });

		const engine = new RSVPEngine(DEFAULT_SETTINGS, () => {}, () => {});
		engine.setSectionNavLabel('Section');
		engine.loadProcessedDocument(processed, { sectionIndex: 1, tokenIndex: 1 });

		expect(engine.getPlaybackStream()).toEqual(processed.sections[1]!.stream);
		expect(engine.getBaseTokenIndex()).toBe(1);
	});

	it('goToSection enables prefix at token zero', () => {
		const engine = new RSVPEngine(DEFAULT_SETTINGS, () => {}, () => {});
		engine.setSectionNavLabel('Chapter');
		engine.loadProcessedDocument(sampleSectionsProcessed(), { sectionIndex: 0, tokenIndex: 0 });
		engine.seekToToken(0);
		engine.setCurrentTokenIndex(0);
		engine.setIsPlaying(false);

		engine.goToSection(1);
		expect(engine.getPlaybackStream()[0]?.text).toBe('Chapter : Networking');
	});
});
