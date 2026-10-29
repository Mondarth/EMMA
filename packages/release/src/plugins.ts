/**
 * Wrappers for semantic-release plugins, which change what a plugin is told of a release.
 *
 * A wrapped plugin is an inline plugin, listed in a configuration's `plugins` as `[plugin, configuration]`. As
 * semantic-release must know a plugin's steps when it reads its configuration, the wrappers load the plugin first, and
 * a configuration awaits them: `plugins: [await onlyCommitsTo(folders, '@semantic-release/commit-analyzer')]`.
 */
import type { Commit } from 'semantic-release';

import { changedFiles, checkFolder, isIn } from './commits.ts';

/** The steps of a release a plugin can take part in, in the order semantic-release takes them. */
export const STEPS = [
  'verifyConditions',
  'analyzeCommits',
  'verifyRelease',
  'generateNotes',
  'addChannel',
  'prepare',
  'publish',
  'success',
  'fail',
] as const;

/** A step of a release. */
export type StepName = (typeof STEPS)[number];

/** What semantic-release tells a plugin of the release, at a step: what the wrappers read of it, and the rest. */
export interface StepContext {
  /** The folder semantic-release runs in, in the repository. */
  readonly cwd?: string | undefined;
  /** The commits since the last release, at the steps from analysing the commits on. */
  readonly commits?: readonly Commit[] | undefined;
  /** The branch released from. */
  readonly branch?: Readonly<Record<string, unknown>> | undefined;
  readonly logger?: { readonly log: (message: string, ...values: unknown[]) => void } | undefined;
  readonly [key: string]: unknown;
}

/** A plugin's configuration, as given to its steps. */
export type PluginConfig = Record<string, unknown>;

/**
 * A plugin's step: given the plugin's configuration, the context and whatever else semantic-release passes.
 * @param pluginConfig - The plugin's configuration, merged into semantic-release's options
 * @param context - What semantic-release tells the plugin of the release
 */
export type Step = (pluginConfig: PluginConfig, context: StepContext, ...rest: unknown[]) => unknown;

/** A plugin: its steps, and the name the release's log knows it by. */
export type Plugin = { readonly [step in StepName]?: Step } & { readonly pluginName?: string };

/** A plugin as a configuration lists it: by its module's name, or itself, with or without its configuration. */
export type PluginSpec = string | Plugin | readonly [string | Plugin] | readonly [string | Plugin, PluginConfig];

/** A plugin and its configuration, as semantic-release's `plugins` option takes them. */
export type PluginEntry = [Plugin, PluginConfig];

/**
 * Whether a plugin is listed with its configuration, or on its own.
 * @param spec - The plugin as listed
 * @returns `true` if it is listed as `[plugin]` or `[plugin, configuration]`
 */
function isListed(spec: PluginSpec): spec is readonly [string | Plugin] | readonly [string | Plugin, PluginConfig] {
  return Array.isArray(spec);
}

/**
 * Load a plugin, from its module if it is named.
 * @param spec - The plugin as listed
 * @returns The plugin, with its configuration and its name
 * @throws {Error} When the module has none of a release's steps
 */
export async function loadPlugin(spec: PluginSpec): Promise<PluginEntry> {
  const [plugin, config = {}] = isListed(spec) ? spec : [spec];
  if (typeof plugin !== 'string') return [plugin, config];

  // As semantic-release loads a plugin: its default export, or else its named exports.
  const imported = (await import(plugin)) as Record<string, unknown>;
  const exported = (imported.default ?? imported) as Record<string, unknown>;
  const loaded: { -readonly [step in StepName]?: Step } = {};
  for (const step of STEPS) {
    if (typeof exported[step] === 'function') loaded[step] = exported[step] as Step;
  }
  if (Object.keys(loaded).length === 0) throw new Error(`${plugin} has none of a release's steps`);
  return [{ ...loaded, pluginName: plugin }, config];
}

/**
 * Wrap a plugin so that each of its steps is told of the release as `change` has it.
 *
 * semantic-release names a plugin's steps in its log by the `pluginName` of each step's function, which it sets only
 * if the function has none: so each wrapped step is given the plugin's name, with what the wrapper does.
 * @param entry - The plugin and its configuration
 * @param does - What the wrapper does, for the release's log
 * @param change - Changes what each step is told
 * @returns The wrapped plugin, with the same configuration
 */
export function changeContext(
  entry: PluginEntry,
  does: string,
  change: (context: StepContext) => StepContext | Promise<StepContext>,
): PluginEntry {
  const [plugin, config] = entry;
  const pluginName = `${plugin.pluginName ?? 'Inline plugin'}, ${does}`;
  const wrapped: { -readonly [step in StepName]?: Step } = {};
  for (const name of STEPS) {
    const step = plugin[name];
    if (step === undefined) continue;
    const changed: Step = async (pluginConfig, context, ...rest) => step(pluginConfig, await change(context), ...rest);
    Object.defineProperty(changed, 'pluginName', { value: pluginName, enumerable: true });
    wrapped[name] = changed;
  }
  return [{ ...wrapped, pluginName }, config];
}

/**
 * Wrap a plugin so that it is told only of the commits that change the given folders, for a package released on its
 * own: its analysis of the commits, its release notes and what it says of the release where (such as in the comments
 * `@semantic-release/github` leaves on the issues and pull requests a release closes) then keep to that package.
 *
 * A merge commit changes no folder of its own: the commits it merges are counted instead.
 * @param folders - The folders, from the repository's root (see {@link packageFolders})
 * @param spec - The plugin as listed
 * @returns The wrapped plugin and its configuration
 * @throws {Error} When no folders are given, or one is not named from the repository's root
 */
export async function onlyCommitsTo(folders: readonly string[], spec: PluginSpec): Promise<PluginEntry> {
  if (folders.length === 0) throw new Error('onlyCommitsTo needs at least one folder');
  const checked = folders.map(checkFolder);

  return changeContext(await loadPlugin(spec), `on ${checked.join(', ')}`, async context => {
    if (context.commits === undefined) return context;
    const files = await changedFiles(
      context.cwd ?? process.cwd(),
      context.commits.map(commit => commit.hash),
    );
    const commits = context.commits.filter(commit => files.get(commit.hash)?.some(file => isIn(file, checked)));
    context.logger?.log('%d of %d commits change %s', commits.length, context.commits.length, checked.join(', '));
    return { ...context, commits };
  });
}

/**
 * Wrap a plugin so that it is told the release is a pre-release, and not on the main release branch.
 *
 * `@semantic-release/github` makes a release from the main release branch the repository's latest, and marks a
 * pre-release by the branch alone. Wrapped, it publishes a pre-release, which is never the latest: for a package
 * released from the same branch as another, whose releases are to stay the latest.
 * @param spec - The plugin as listed
 * @returns The wrapped plugin and its configuration
 */
export async function asPrerelease(spec: PluginSpec): Promise<PluginEntry> {
  return changeContext(await loadPlugin(spec), 'as a pre-release', context =>
    context.branch === undefined
      ? context
      : { ...context, branch: { ...context.branch, prerelease: true, main: false } },
  );
}
