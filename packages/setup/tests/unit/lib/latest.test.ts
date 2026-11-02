import type { Release } from '@mondarth/fvtt-resolver';
import { describe, expect, test } from 'vitest';

import { acceptLatest } from '../../../src/lib/latest';
import { release } from '../../mocks/fixtures';
import { KIT } from '../../mocks/kit';

const LATEST = 'https://github.com/someone/dice/releases/latest/download/module.json';

/**
 * A release of Dice from its "latest" manifest, with no manifest of its own.
 * @param version - Its version
 * @param change - What differs
 * @returns The release
 */
const fromLatest = (version: string, change: Partial<Release> = {}): Release => ({
  ...release('module:dice', version, { versionManifest: null }),
  manifest: LATEST,
  ...change,
});

/**
 * The manifest each release can be installed from.
 * @param releases - The releases
 * @returns Each one's version and manifest
 */
const manifests = (releases: readonly Release[]) =>
  releases.map(({ version, versionManifest }) => [version, versionManifest]);

describe('acceptLatest', () => {
  test('takes a "latest" manifest as the own manifest of the newest release loaded from it alone', () => {
    const found = acceptLatest(
      KIT.resolver,
      [fromLatest('1.0.0'), fromLatest('v1.2.0'), fromLatest('1.1.0'), fromLatest('2.0.0', { detail: 'listed' })],
      new Map(),
    );

    expect(manifests(found)).toEqual([
      ['1.0.0', undefined],
      ['v1.2.0', LATEST],
      ['1.1.0', undefined],
      // One only listed is not what the manifest was found to give.
      ['2.0.0', undefined],
    ]);
  });

  test("checks the version against Foundry's index, where it lists the package", () => {
    const releases = [fromLatest('1.2.0')];

    expect(manifests(acceptLatest(KIT.resolver, releases, new Map([['module:dice', '1.2.0']])))).toEqual([
      ['1.2.0', LATEST],
    ]);
    expect(manifests(acceptLatest(KIT.resolver, releases, new Map([['module:dice', '1.3.0']])))).toEqual([
      ['1.2.0', undefined],
    ]);
    expect(manifests(acceptLatest(KIT.resolver, releases, new Map([['module:other', '9.0.0']])))).toEqual([
      ['1.2.0', LATEST],
    ]);
  });

  test('leaves a release with a manifest of its own, or none at all, as it is', () => {
    const own = release('module:lib', '1.0.0');
    const none = release('module:bare', '1.0.0', { versionManifest: null });
    const later = { ...release('module:lib', '0.9.0'), manifest: LATEST };

    const found = acceptLatest(KIT.resolver, [own, none, later], new Map());

    expect(found[0]).toBe(own);
    expect(found[1]).toBe(none);
    expect(found[2]).toBe(later);
  });
});
