import type { ActivationMap, ModuleEntry } from '@module/adapters/modules';
import { ModuleState } from '@module/state/module-state.svelte';

/**
 * Three installed modules, in display order. Dice So Nice! is verified and has two authors and two languages,
 * libWrapper has one of each, and EMMA no details or badge at all.
 */
export const ENTRIES: readonly ModuleEntry[] = [
  {
    id: 'dice',
    title: 'Dice So Nice!',
    version: '5.2.4',
    badge: { type: 'success', icon: 'fa-solid fa-code-branch', tooltip: 'Verified', text: 'Verified' },
    description: '<p>Rolls <strong>3D dice</strong>.</p>',
    authors: [{ name: 'Simone', url: 'https://example.com/simone', discord: 'simone#1' }, { name: 'JDW' }],
    languages: [
      { lang: 'en', name: 'English' },
      { lang: 'fr', name: 'Français' },
    ],
    requires: [],
  },
  {
    id: 'emma',
    title: 'EMMA',
    version: '0.1.0',
    badge: null,
    description: '',
    authors: [],
    languages: [],
    requires: [],
  },
  {
    id: 'lib-wrapper',
    title: 'libWrapper',
    version: '1.13.2',
    badge: null,
    description: '<p>A library.</p>',
    authors: [{ name: 'ruipin', email: 'ruipin@example.com' }],
    languages: [{ lang: 'en', name: 'English' }],
    requires: [],
  },
];

/**
 * Create the state for {@link ENTRIES}: by default only libWrapper is active.
 * @param saved - The saved activation
 * @param entries - The installed modules
 * @returns The state
 */
export function createModules(
  saved: ActivationMap = { 'lib-wrapper': true },
  entries: readonly ModuleEntry[] = ENTRIES,
): ModuleState {
  return new ModuleState(entries, saved);
}
