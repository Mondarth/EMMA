import { registerDrawerFieldsMenu } from '@module/app/drawer-fields-config';
import { registerVersionProxyMenu } from '@module/app/version-proxy-config';
import { registerModuleManagementOverride } from '@module/foundry/settings-entry';
import { log } from '@module/lib/logger';
import { registerSettings } from '@module/settings';

Hooks.once('init', () => {
  log.info('Initializing');
  registerSettings();
  registerDrawerFieldsMenu();
  registerVersionProxyMenu();
  registerModuleManagementOverride();
});
