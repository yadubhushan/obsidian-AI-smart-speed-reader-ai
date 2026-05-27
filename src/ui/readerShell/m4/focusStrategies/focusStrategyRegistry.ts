import type { FocusStrategyId } from '../../../../types';
import { buildCrowdingShieldFocusBlock } from './crowdingShieldStrategy';
import { buildForwardPullFocusBlock } from './forwardPullStrategy';
import { buildMultiOrpFocusBlock } from './multiOrpStrategy';
import { buildOrpFocusBlock } from './orpStrategy';
import { buildParafovealFocusBlock } from './parafovealStrategy';
import { buildPeachAnchorFocusBlock } from './peachAnchorStrategy';
import type { FocusBlockInput, FocusBlockOutput, FocusStrategyDefinition } from './focusStrategyTypes';
import { FOCUS_STRATEGY_LABELS } from './focusStrategyTypes';

const LIVE_STRATEGIES = new Set<FocusStrategyId>([
	'orp',
	'peach-anchor',
	'forward-pull',
	'parafoveal',
	'multi-orp',
	'crowding-shield'
]);

export function isFocusStrategyLive(id: FocusStrategyId): boolean {
	return LIVE_STRATEGIES.has(id);
}

function wrapBuilder(
	id: FocusStrategyId,
	builder: (input: FocusBlockInput) => FocusBlockOutput
): FocusStrategyDefinition {
	const meta = FOCUS_STRATEGY_LABELS[id] ?? FOCUS_STRATEGY_LABELS.orp;
	return {
		id,
		name: meta.name,
		description: meta.description,
		isLive: LIVE_STRATEGIES.has(id),
		buildBlock: builder
	};
}

const REGISTRY: Record<FocusStrategyId, FocusStrategyDefinition> = {
	orp: wrapBuilder('orp', buildOrpFocusBlock),
	'peach-anchor': wrapBuilder('peach-anchor', buildPeachAnchorFocusBlock),
	'forward-pull': wrapBuilder('forward-pull', buildForwardPullFocusBlock),
	parafoveal: wrapBuilder('parafoveal', buildParafovealFocusBlock),
	'multi-orp': wrapBuilder('multi-orp', buildMultiOrpFocusBlock),
	'crowding-shield': wrapBuilder('crowding-shield', buildCrowdingShieldFocusBlock)
};

export function getFocusStrategy(id: FocusStrategyId): FocusStrategyDefinition {
	return REGISTRY[id] ?? REGISTRY.orp;
}

export function renderFocusBlock(input: FocusBlockInput): FocusBlockOutput {
	const strategy = getFocusStrategy(input.focusStrategy);
	return strategy.buildBlock(input);
}

/** RSVP display: use requested strategy when live, otherwise a safe live fallback. */
export function renderLiveFocusBlock(input: FocusBlockInput): FocusBlockOutput {
	const block = renderFocusBlock(input);
	if (block.isLive) {
		return block;
	}
	const fallback: FocusStrategyId = input.chunkSize === 1 ? 'orp' : 'peach-anchor';
	return renderFocusBlock({ ...input, focusStrategy: fallback });
}

export function listFocusStrategies(): FocusStrategyDefinition[] {
	return Object.values(REGISTRY);
}
