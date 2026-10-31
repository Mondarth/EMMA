import { describe, expect, test, vi } from 'vitest';

import { SETUP_KIT_API } from '@mondarth/emma-core/setup-kit';

import type { InstalledManifests, PackageManifest } from '../../../src/foundry/setup-game';
import { EMMA_MODULE_ID, KitUnavailable, loadKit, locateKit } from '../../../src/foundry/setup-kit';
import { KIT } from '../../mocks/kit';

const CORE = { version: '14.368', generation: 14, channel: 'stable' };

/**
 * An installation with the EMMA module, whose manifest has some flags.
 * @param flags - The flags
 * @param version - The module's version
 * @returns The installation
 */
function withEmma(flags: unknown, version = '1.0.0'): InstalledManifests {
  const emma: PackageManifest = {
    type: 'module',
    id: EMMA_MODULE_ID,
    version,
    json: { id: EMMA_MODULE_ID, version, flags },
    origin: `modules/${EMMA_MODULE_ID}/module.json`,
  };
  return { core: CORE, manifests: [emma] };
}

/**
 * The server's route for a path, as on a server under `/foundry`.
 * @param path - The path
 * @returns Its route
 */
const route = (path: string) => `/foundry/${path}`;

describe('locateKit', () => {
  test('finds the kit the EMMA module names, at a URL that changes with its version', () => {
    const installed = withEmma({ setupKit: { api: SETUP_KIT_API, path: '/dist/emma-setup-kit.js' } }, '1.2.0+b');

    expect(locateKit(installed, route)).toEqual({
      ok: true,
      url: '/foundry/modules/mondarth-emma/dist/emma-setup-kit.js?v=1.2.0%2Bb',
      version: '1.2.0+b',
    });
  });

  test('says the EMMA module is missing, as a system of its ID is not it', () => {
    const installed: InstalledManifests = {
      core: CORE,
      manifests: [{ type: 'system', id: EMMA_MODULE_ID, version: '1.0.0', json: {}, origin: 'x' }],
    };

    expect(locateKit(installed, route)).toEqual({ ok: false, problem: { reason: 'missing' } });
  });

  test('asks for the module to be updated when it names no kit, or one that gives too little', () => {
    for (const installed of [withEmma({}), withEmma(undefined)])
      expect(locateKit(installed, route)).toEqual({
        ok: false,
        problem: { reason: 'module-too-old', version: '1.0.0' },
      });
    const bare = withEmma({});
    expect(locateKit({ ...bare, manifests: bare.manifests.map(m => ({ ...m, json: null })) }, route)).toEqual({
      ok: false,
      problem: { reason: 'module-too-old', version: '1.0.0' },
    });
    expect(locateKit(withEmma({ setupKit: { api: '0.9', path: 'kit.js' } }), route)).toEqual({
      ok: false,
      problem: { reason: 'module-too-old', version: '1.0.0' },
    });
  });

  test('asks for the extension to be updated when the kit is of a newer major', () => {
    expect(locateKit(withEmma({ setupKit: { api: '99.0', path: 'kit.js' } }, '9.0.0'), route)).toEqual({
      ok: false,
      problem: { reason: 'extension-too-old', version: '9.0.0' },
    });
  });
});

describe('loadKit', () => {
  const location = { url: '/modules/mondarth-emma/dist/emma-setup-kit.js?v=1.0.0', version: '1.0.0' };

  test('imports the kit, when it fits', async () => {
    const load = vi.fn(() => Promise.resolve({ default: KIT }));

    await expect(loadKit(location, load)).resolves.toBe(KIT);
    expect(load).toHaveBeenCalledExactlyOnceWith(location.url);
  });

  test('refuses a kit that does not fit after all, or is no kit', async () => {
    for (const loaded of [{ default: { ...KIT, api: '99.0' } }, { default: null }, null, {}]) {
      const refused = loadKit(location, () => Promise.resolve(loaded));
      await expect(refused).rejects.toBeInstanceOf(KitUnavailable);
    }
    await expect(loadKit(location, () => Promise.resolve({ default: { api: '99.0' } }))).rejects.toMatchObject({
      problem: { reason: 'extension-too-old', version: '1.0.0' },
    });
  });

  test("imports with the browser's import() by default", async () => {
    // A module that is no kit.
    await expect(loadKit({ url: 'data:text/javascript,export default 1', version: '1.0.0' })).rejects.toBeInstanceOf(
      KitUnavailable,
    );
  });
});
