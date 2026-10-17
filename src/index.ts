import { registerModuleManagementOverride } from '@module/foundry/settings-entry';
import { log } from '@module/lib/logger';
import { registerSettings } from '@module/settings';

Hooks.once('init', () => {
  log.info('Initializing');
  registerSettings();
  registerModuleManagementOverride();
});
