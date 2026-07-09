import { describe, expect, it } from 'vitest';
import {
	clampFontSize,
	clampWpm,
	customReaderColorVars,
	FONT_SIZE_STEP,
	MAX_FONT_SIZE,
	MAX_WPM,
	MIN_FONT_SIZE,
	MIN_WPM,
	stepFontSize
} from '../src/ui/readerShell/readerAppearance';

describe('clampFontSize', () => {
	it('clamps to the allowed range and rounds', () => {
		expect(clampFontSize(10)).toBe(MIN_FONT_SIZE);
		expect(clampFontSize(999)).toBe(MAX_FONT_SIZE);
		expect(clampFontSize(48.6)).toBe(49);
		expect(clampFontSize(MIN_FONT_SIZE)).toBe(MIN_FONT_SIZE);
		expect(clampFontSize(MAX_FONT_SIZE)).toBe(MAX_FONT_SIZE);
	});
});

describe('stepFontSize', () => {
	it('steps within bounds', () => {
		expect(stepFontSize(48, FONT_SIZE_STEP)).toBe(48 + FONT_SIZE_STEP);
		expect(stepFontSize(48, -FONT_SIZE_STEP)).toBe(48 - FONT_SIZE_STEP);
	});

	it('saturates at the bounds', () => {
		expect(stepFontSize(MIN_FONT_SIZE, -FONT_SIZE_STEP)).toBe(MIN_FONT_SIZE);
		expect(stepFontSize(MAX_FONT_SIZE, FONT_SIZE_STEP)).toBe(MAX_FONT_SIZE);
		expect(stepFontSize(MIN_FONT_SIZE + 1, -FONT_SIZE_STEP)).toBe(MIN_FONT_SIZE);
	});
});

describe('clampWpm', () => {
	it('clamps to the reader WPM range and rounds', () => {
		expect(clampWpm(0)).toBe(MIN_WPM);
		expect(clampWpm(99999)).toBe(MAX_WPM);
		expect(clampWpm(300.4)).toBe(300);
	});
});

describe('customReaderColorVars', () => {
	it('maps set colors to CSS variables', () => {
		expect(
			customReaderColorVars({ focusWord: '#ff0000', centerCharacter: '#00ff00' })
		).toEqual({
			'--sr-focus-word-color': '#ff0000',
			'--sr-center-character-color': '#00ff00'
		});
	});

	it('maps unset or empty colors to null so they are removed', () => {
		expect(customReaderColorVars({})).toEqual({
			'--sr-focus-word-color': null,
			'--sr-center-character-color': null
		});
		expect(customReaderColorVars({ focusWord: '', centerCharacter: '#123456' })).toEqual({
			'--sr-focus-word-color': null,
			'--sr-center-character-color': '#123456'
		});
	});
});
