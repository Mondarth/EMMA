/**
 * The repository's release configurations: each package is released on its own, from the commits that change it.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import type { Plugin, PluginConfig } from '../src/plugins.ts';

/** The repository's root, which semantic-release runs in. */
const REPOSITORY = path.resolve(import.meta.dirname, '../../..');

/** What the tests read of a release configuration. */
interface ReleaseConfig {
  readonly branches: readonly string[];
  readonly tagFormat: string;
  readonly plugins: readonly (string | readonly [string | Plugin, PluginConfig])[];
}

/**
 * Load a package's release configuration.
 * @param folder - The package's folder
 * @returns The configuration
 */
async function configOf(folder: string): Promise<ReleaseConfig> {
  const file = path.join(REPOSITORY, folder, 'release.config.js');
  return ((await import(file)) as { default: ReleaseConfig }).default;
}

/**
 * The names of a configuration's plugins, as the release's log gives them.
 * @param config - The configuration
 * @returns The names, in order
 */
function pluginNames(config: ReleaseConfig): (string | undefined)[] {
  return config.plugins.map(plugin => {
    if (typeof plugin === 'string') return plugin;
    const [named] = plugin;
    return typeof named === 'string' ? named : named.pluginName;
  });
}

/**
 * The configuration of a plugin, found by the start of its name.
 * @param config - The release configuration
 * @param name - The plugin's module
 * @returns The plugin's configuration
 */
function optionsOf(config: ReleaseConfig, name: string): PluginConfig {
  const index = pluginNames(config).findIndex(found => found?.startsWith(name));
  const plugin = config.plugins[index];
  if (plugin === undefined || typeof plugin === 'string') throw new Error(`No configured ${name}`);
  return plugin[1];
}

/**
 * Whether a tag is one of a release stream's, as semantic-release finds them (lib/branches/get-tags.js).
 * @param tagFormat - The stream's tag format
 * @param tag - The tag
 * @returns `true` if semantic-release would count it as one of the stream's releases
 */
function isTagOf(tagFormat: string, tag: string): boolean {
  const [before = '', after = ''] = tagFormat.split('${version}');
  const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // As semantic-release does: anchored at the start only.
  return new RegExp(`^${escaped(before)}(.+)${escaped(after)}`).test(tag);
}

const ON_MODULE = 'on packages/core, packages/module';
const ON_EXTENSION = 'on packages/core, packages/extension, packages/setup';

describe("the module's releases", async () => {
  const config = await configOf('packages/module');

  test('are made from main, and tagged v<version>', () => {
    expect(config.branches).toEqual(['main']);
    expect(config.tagFormat).toBe('v${version}');
  });

  test("are tagged as its manifests' download links have it", () => {
    const packaging = fs.readFileSync(path.join(REPOSITORY, 'packages/module/scripts/release/package.ts'), 'utf8');

    expect(packaging).toContain('/releases/download/v${version}/');
  });

  test('count only the commits that change the module or the shared code', () => {
    expect(pluginNames(config)).toEqual([
      `@semantic-release/commit-analyzer, ${ON_MODULE}`,
      `@semantic-release/release-notes-generator, ${ON_MODULE}`,
      '@semantic-release/changelog',
      '@semantic-release/exec',
      '@semantic-release/git',
      `@semantic-release/github, ${ON_MODULE}`,
    ]);
  });
});

describe("the extension's releases", async () => {
  const config = await configOf('packages/extension');

  test('are made from main, and tagged extension-v<version>', () => {
    expect(config.branches).toEqual(['main']);
    expect(config.tagFormat).toBe('extension-v${version}');
  });

  test("count only the commits that change the extension, the setup screen's code or the shared code", () => {
    expect(pluginNames(config)).toEqual([
      `@semantic-release/commit-analyzer, ${ON_EXTENSION}`,
      `@semantic-release/release-notes-generator, ${ON_EXTENSION}`,
      '@semantic-release/changelog',
      '@semantic-release/exec',
      '@semantic-release/git',
      `@semantic-release/github, ${ON_EXTENSION}, as a pre-release`,
    ]);
  });

  test('change and commit only files of the extension', () => {
    expect(optionsOf(config, '@semantic-release/changelog')).toEqual({
      changelogFile: 'packages/extension/CHANGELOG.md',
    });
    expect(optionsOf(config, '@semantic-release/git').assets).toEqual([
      'packages/extension/CHANGELOG.md',
      'packages/extension/package.json',
    ]);
  });

  test('are packaged by a script the repository has', () => {
    const { prepareCmd } = optionsOf(config, '@semantic-release/exec') as { prepareCmd: string };
    const script = /^node (\S+) /.exec(prepareCmd)?.[1] ?? '';

    expect(fs.existsSync(path.join(REPOSITORY, script))).toBe(true);
  });
});

describe('the two release streams', async () => {
  const moduleConfig = await configOf('packages/module');
  const extensionConfig = await configOf('packages/extension');

  test("never take each other's tags", () => {
    expect(isTagOf(moduleConfig.tagFormat, 'v0.9.0')).toBe(true);
    expect(isTagOf(moduleConfig.tagFormat, 'extension-v0.1.0')).toBe(false);
    expect(isTagOf(extensionConfig.tagFormat, 'extension-v0.1.0')).toBe(true);
    expect(isTagOf(extensionConfig.tagFormat, 'v0.9.0')).toBe(false);
  });

  test('report a failing release each in an issue of its own', () => {
    expect(optionsOf(moduleConfig, '@semantic-release/github').failTitle).not.toBe(
      optionsOf(extensionConfig, '@semantic-release/github').failTitle,
    );
  });
});
