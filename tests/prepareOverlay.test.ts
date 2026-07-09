import { describe, expect, it } from 'vitest';
import {
	createPrepareOverlayController,
	type PrepareOverlayRenderState
} from '../src/ui/readerShell/prepareOverlay';

function createHarness() {
	const renders: PrepareOverlayRenderState[] = [];
	const controller = createPrepareOverlayController({
		render: (state) => renders.push({ ...state })
	});
	return { controller, renders };
}

describe('createPrepareOverlayController', () => {
	it('starts hidden', () => {
		const { controller } = createHarness();
		expect(controller.isVisible()).toBe(false);
	});

	it('shows with a cleared subline', () => {
		const { controller, renders } = createHarness();

		controller.update('stale subline from previous run');
		controller.show();

		expect(controller.isVisible()).toBe(true);
		expect(renders.at(-1)).toEqual({ visible: true, subline: null });
	});

	it('updates the subline while visible', () => {
		const { controller, renders } = createHarness();

		controller.show();
		controller.update('Batch 2 of 5');

		expect(renders.at(-1)).toEqual({ visible: true, subline: 'Batch 2 of 5' });
	});

	it('treats an empty subline as cleared', () => {
		const { controller, renders } = createHarness();

		controller.show();
		controller.update('Batch 1 of 2');
		controller.update('');

		expect(renders.at(-1)).toEqual({ visible: true, subline: null });
	});

	it('hides and clears the subline', () => {
		const { controller, renders } = createHarness();

		controller.show();
		controller.update('Batch 1 of 2');
		controller.hide();

		expect(controller.isVisible()).toBe(false);
		expect(renders.at(-1)).toEqual({ visible: false, subline: null });
	});
});
