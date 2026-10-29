/**
 * EMMA's release tooling: semantic-release plugins and helpers that release each of the repository's packages on its
 * own, from the commits that change it.
 */
export { changedFiles, checkFolder, isIn } from './commits.ts';
export type { Plugin, PluginConfig, PluginEntry, PluginSpec, Step, StepContext, StepName } from './plugins.ts';
export { asPrerelease, changeContext, loadPlugin, onlyCommitsTo, STEPS } from './plugins.ts';
export { packageFolders, PACKAGES_FOLDER } from './workspace.ts';
