import { registerDrawerFieldsMenu } from '@module/app/drawer-fields-config';
import { startWorldRecord } from '@module/app/world-record';
import { registerModuleManagementOverride } from '@module/foundry/settings-entry';
import { log } from '@module/lib/logger';
import { registerGmSettings, registerSettings } from '@module/settings';

Hooks.once('init', () => {
  log.info('Initializing');
  registerSettings();
  registerDrawerFieldsMenu();
  registerModuleManagementOverride();
});

Hooks.once('setup', () => {
  registerGmSettings();
});

Hooks.once('ready', () => {
  startWorldRecord();
});
