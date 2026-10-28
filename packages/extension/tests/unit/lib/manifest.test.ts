import { describe, expect, test } from 'vitest';

import { GECKO_ID, manifestFor } from '../../../scripts/manifest';

describe('manifestFor', () => {
  test.each(['chromium', 'firefox'] as const)('asks for no site until the user activates one, on %s', target => {
    const manifest = manifestFor(target, '0.1.0');

    expect(manifest).toMatchObject({
      manifest_version: 3,
      version: '0.1.0',
      permissions: ['storage', 'scripting', 'activeTab'],
      optional_host_permissions: ['http://*/*', 'https://*/*'],
    });
    expect(manifest).not.toHaveProperty('host_permissions');
    expect(manifest).not.toHaveProperty('content_scripts');
  });

  test('runs the background as a service worker on Chromium, from Chrome 102', () => {
    expect(manifestFor('chromium', '0.1.0')).toMatchObject({
      version_name: '0.1.0 alpha',
      minimum_chrome_version: '102',
      background: { service_worker: 'background.js', type: 'module' },
    });
  });

  test('runs the background as a script on Firefox, from Firefox 157, collecting no data', () => {
    expect(manifestFor('firefox', '0.1.0')).toMatchObject({
      background: { scripts: ['background.js'], type: 'module' },
      browser_specific_settings: {
        gecko: { id: GECKO_ID, strict_min_version: '157.0', data_collection_permissions: { required: ['none'] } },
      },
    });
  });
});
