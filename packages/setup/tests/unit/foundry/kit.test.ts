import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ReleaseCheck } from '@mondarth/fvtt-resolver';
import { AVAILABILITY } from '@mondarth/fvtt-resolver';
import { SETUP_KIT_API } from '@mondarth/emma-core/setup-kit';

import { KIT } from '../../../src/foundry/kit';
import { releaseBadge } from '../../../src/foundry/release-badge';
import { release } from '../../mocks/fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the extension's own kit", () => {
  test('is of the API version this build has, built in, with no server to ask', () => {
    expect(KIT.api).toBe(SETUP_KIT_API);
  });

  test('gives the resolver and its sources', () => {
    expect(KIT.resolver.packageKey({ type: 'module', id: 'lib' })).toBe('module:lib');
    expect(typeof KIT.resolver.check).toBe('function');
    expect(typeof KIT.sources.catalogueSet).toBe('function');
    expect(typeof KIT.sources.catalogueSource).toBe('function');
    expect(typeof KIT.sources.localSource).toBe('function');
  });

  test("badges versions with EMMA's verdict, in Foundry's colours", () => {
    expect(KIT.badges.releaseBadge).toBe(releaseBadge);
  });
});

describe("a release's badge", () => {
  /**
   * Foundry's own badges, as `foundry.packages` gives them, with what they were asked.
   * @param badge - What each gives
   * @returns The stand-ins
   */
  function foundryBadges(badge: { type: string; icon?: string; tooltip: string } | null) {
    const moduleBadge = vi.fn((..._args: unknown[]) => badge);
    const systemBadge = vi.fn((..._args: unknown[]) => badge);
    vi.stubGlobal('foundry', {
      packages: { Module: { getVersionBadge: moduleBadge }, System: { getVersionBadge: systemBadge } },
      utils: { Collection: Map },
    });
    return { moduleBadge, systemBadge };
  }

  const checked = (ref: `${'module' | 'system'}:${string}`, availability: number): ReleaseCheck =>
    ({
      release: release(ref, '2.0.0', { requires: { lib: { minimum: '1.0.0' } }, systems: { dnd5e: {} } }),
      availability,
    }) as unknown as ReleaseCheck;

  test("is Foundry's badge for a module, given EMMA's verdict, with its explanation as text too", () => {
    const { moduleBadge } = foundryBadges({ type: 'warning', tooltip: '<p>Needs <strong>Library</strong> 1.0.0</p>' });
    const app = checked('module:app', AVAILABILITY.REQUIRES_DEPENDENCY_UPDATE);
    const lib = {
      release: release('module:lib', '0.9.0'),
      availability: AVAILABILITY.REQUIRES_CORE_UPGRADE_STABLE,
    } as ReleaseCheck;

    expect(releaseBadge(app, [app, lib])).toEqual({
      type: 'warning',
      icon: 'fa-solid fa-code-branch',
      tooltip: '<p>Needs <strong>Library</strong> 1.0.0</p>',
      text: 'Needs Library 1.0.0',
    });
    const [code, data, options] = moduleBadge.mock.calls[0] as [
      number,
      { id: string; version: string; active: boolean; relationships: { requires: object[]; systems: object[] } },
      { modules: Map<string, { version: string; unavailable: boolean }>; systems: Map<string, unknown> },
    ];
    expect(code).toBe(AVAILABILITY.REQUIRES_DEPENDENCY_UPDATE);
    expect(data).toMatchObject({ id: 'app', version: '2.0.0', active: false });
    expect(data.relationships.requires).toEqual([
      { id: 'lib', type: 'module', compatibility: { minimum: '1.0.0' }, manifest: undefined, reason: undefined },
    ]);
    expect(data.relationships.systems).toEqual([
      { id: 'dnd5e', type: 'system', compatibility: {}, manifest: undefined, reason: undefined },
    ]);
    // The setup's packages, as Foundry looks them up to name what the release does not suit.
    expect(options.modules.get('lib')).toEqual({ id: 'lib', version: '0.9.0', unavailable: true });
    expect(options.modules.get('app')).toMatchObject({ unavailable: true });
    const verified = checked('module:dice', AVAILABILITY.VERIFIED);
    releaseBadge(verified, [verified]);
    const [, , again] = moduleBadge.mock.calls[1] as [
      number,
      object,
      { modules: Map<string, { unavailable: boolean }> },
    ];
    expect(again.modules.get('dice')).toMatchObject({ unavailable: false });
    expect(options.systems.size).toBe(0);
  });

  test("is Foundry's system badge for a game system, keeping its own icon", () => {
    const { moduleBadge, systemBadge } = foundryBadges({
      type: 'success',
      icon: 'fa-solid fa-check',
      tooltip: 'Verified',
    });
    const dnd = checked('system:dnd5e', AVAILABILITY.VERIFIED);

    expect(releaseBadge(dnd, [dnd])).toEqual({
      type: 'success',
      icon: 'fa-solid fa-check',
      tooltip: 'Verified',
      text: 'Verified',
    });
    expect(systemBadge).toHaveBeenCalledOnce();
    expect(moduleBadge).not.toHaveBeenCalled();
  });

  test('is none where Foundry gives none', () => {
    foundryBadges(null);
    const app = checked('module:app', AVAILABILITY.UNKNOWN);
    expect(releaseBadge(app, [app])).toBeNull();
  });
});
