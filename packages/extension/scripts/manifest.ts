/**
 * The extension's `manifest.json`, for each browser it is built for.
 */
import type { Target } from '../src/lib/sites.ts';

/** The extension's ID on Firefox, which Mozilla signs it under. */
export const GECKO_ID = 'emma@mondarth';

/** The icon sizes in `public/icons`. */
const ICONS = Object.fromEntries([16, 32, 48, 128].map(size => [String(size), `icons/emma-${String(size)}.png`]));

/**
 * The manifest for a browser.
 * @param target - The browser
 * @param version - The extension's version, from its `package.json`
 * @returns The manifest
 */
export function manifestFor(target: Target, version: string): Record<string, unknown> {
  return {
    manifest_version: 3,
    name: '__MSG_name__',
    description: '__MSG_description__',
    version,
    default_locale: 'en',
    icons: ICONS,
    action: { default_title: '__MSG_popupTitle__', default_popup: 'popup/index.html', default_icon: ICONS },
    options_ui: { page: 'options/index.html', open_in_tab: true },
    // No access to any site until the user activates EMMA on one: host permissions are optional, asked for per server.
    permissions: ['storage', 'scripting', 'activeTab'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    ...(target === 'chromium'
      ? {
          version_name: `${version} alpha`,
          // Running a registered script in the page itself (`world: "MAIN"`) needs Chrome 102.
          minimum_chrome_version: '102',
          background: { service_worker: 'background.js', type: 'module' },
        }
      : {
          background: { scripts: ['background.js'], type: 'module' },
          browser_specific_settings: {
            gecko: {
              id: GECKO_ID,
              // Firefox 128 introduced running a script in the page itself (`world: "MAIN"`), but EMMA's injection
              // failed in a release before 157 ("Unable to load script"). 157 is the oldest it has been seen to work in.
              strict_min_version: '157.0',
              // The extension sends nothing anywhere.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }),
  };
}
