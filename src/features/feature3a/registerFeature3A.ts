import type SpeedReaderAiPlugin from '../../main';
import type { PluginServices } from '../../services/serviceRegistry';
import type { EpubVaultIndexImpl } from '../../history/epubVaultIndex';

export function registerFeature3A(plugin: SpeedReaderAiPlugin, services: PluginServices): void {
	(services.epubVaultIndex as EpubVaultIndexImpl).registerVaultListeners(plugin);
}
