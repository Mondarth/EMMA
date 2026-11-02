/**
 * Carries out one step of an update plan on the setup screen, through Foundry's own methods, as its buttons do:
 * `game.createSnapshot` and `game.createBackup` as **Manage Backups** calls them, `game.installPackage` as its
 * Install button does, with the guard letting it through, and uninstalling as its **Uninstall** does once the user
 * confirms it (see `uninstallPackage`). Checked on Foundry 14.368.
 *
 * A package is installed without Foundry's dependency dialog: the plan has every package a change needs already, in
 * the order to install them.
 */
import { format, localize } from '../lib/i18n';
import type { RunStep } from '../lib/run';
import type { Guard } from './guard';
import type { SetupGame } from './setup-game';
import { uninstallPackage } from './setup-game';

/**
 * Carry out a step.
 * @param game - The setup screen's `game`
 * @param guard - The guard, to let the installs through
 * @param step - The step; Foundry VTT's own update is not one of those carried out here
 * @returns Once done
 * @throws {Error} If it fails, saying why
 */
export async function runStep(game: SetupGame, guard: Guard, step: Exclude<RunStep, { kind: 'core' }>): Promise<void> {
  switch (step.kind) {
    case 'snapshot': {
      const { createSnapshot } = game;
      if (createSnapshot === undefined) throw new Error(localize('Run.NoSnapshots'));
      await createSnapshot.call(game, { note: step.note });
      return;
    }
    case 'backup': {
      const { createBackup } = game;
      if (createBackup === undefined) throw new Error(localize('Run.NoBackups'));
      const backedUp = await createBackup.call(game, { type: 'world', ...step.world }, { note: step.note });
      if (!backedUp) throw new Error(format('Run.BackupFailed', { world: step.world.title }));
      return;
    }
    case 'install': {
      const { installPackage } = game;
      if (installPackage === undefined) throw new Error(localize('Run.NoInstalls'));
      const { manifest } = step;
      if (manifest === undefined)
        throw new Error(format('Run.NoManifest', { title: step.title, version: step.version }));
      await guard.allowing(() =>
        installPackage.call(game, { type: step.type, id: step.id, manifest, dependencies: false, notify: false }),
      );
      return;
    }
    case 'uninstall':
      await uninstallPackage(game, step.type, step.id);
  }
}
