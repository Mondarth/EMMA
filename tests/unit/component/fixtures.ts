import type { ActivationMap, ModuleEntry } from '@module/adapters/modules';
import { ModuleState } from '@module/state/module-state.svelte';
import { moduleEntry } from '../mocks/entries';

/**
 * Three installed modules, in display order. Dice So Nice! is verified and gives two of most details, libWrapper one
 * of each and is a library, and EMMA no details or badge at all.
 */
export const ENTRIES: readonly ModuleEntry[] = [
  moduleEntry({
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
    links: [
      { kind: 'url', url: 'https://example.com/dice' },
      { kind: 'readme', url: 'https://foundry.example/modules/dice/README.md' },
    ],
    compatibility: { minimum: '13', verified: '14.368' },
    relationships: {
      systems: [
        { id: 'dnd5e', type: 'system', title: 'D&D Fifth Edition' },
        { id: 'pf2e', type: 'system', title: 'pf2e' },
      ],
      requires: [{ id: 'lib-wrapper', type: 'module', title: 'libWrapper', reason: 'Wraps the dice roller.' }],
      recommends: [
        { id: 'emma', type: 'module', title: 'EMMA' },
        { id: 'dice-tray', type: 'module', title: 'dice-tray', reason: 'A tray for the dice.' },
      ],
      conflicts: [{ id: 'old-dice', type: 'module', title: 'old-dice' }],
    },
    packs: [
      { name: 'dice-macros', label: 'Dice Macros', type: 'Macro' },
      { name: 'dice-tables', label: 'Dice Tables', type: 'RollTable' },
    ],
    requires: ['lib-wrapper'],
  }),
  moduleEntry({ id: 'emma', title: 'EMMA', version: '0.1.0' }),
  moduleEntry({
    id: 'lib-wrapper',
    title: 'libWrapper',
    version: '1.13.2',
    description: '<p>A library.</p>',
    authors: [{ name: 'ruipin', email: 'ruipin@example.com' }],
    languages: [{ lang: 'en', name: 'English' }],
    links: [{ kind: 'bugs', url: 'https://example.com/lib-wrapper/issues' }],
    compatibility: { maximum: '14' },
    packs: [{ name: 'wrappers', label: 'Wrappers', type: 'JournalEntry' }],
    library: true,
  }),
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
