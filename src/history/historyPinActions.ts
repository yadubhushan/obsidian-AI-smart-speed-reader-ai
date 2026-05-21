import { Notice } from 'obsidian';
import type { PluginServices } from '../services/serviceRegistry';
import { PIN_LIMIT_NOTICE, tryPinState } from './historyFilters';

export async function toggleHistoryPin(
	services: PluginServices,
	sourcePath: string
): Promise<boolean> {
	await services.readingStateStore.load();
	const state = services.readingStateStore.get(sourcePath);
	if (!state) {
		return false;
	}

	const file = await services.readingStateStore.load();
	const result = tryPinState(state, file);
	if (!result.ok) {
		new Notice(PIN_LIMIT_NOTICE);
		return false;
	}

	await services.readingStateStore.upsert(result.state);
	await services.readingStateStore.flush();
	return true;
}
