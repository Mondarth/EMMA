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
import type { RunStep, StepProgress } from '../lib/run';
import type { Guard } from './guard';
import type { SetupGame } from './setup-game';
import { uninstallPackage } from './setup-game';

/** Foundry's steps of an install, as its progress packets name them, by the phase each is of. */
const PHASES: Readonly<Record<string, StepProgress['phase']>> = { download: 'download', install: 'install' };

/**
 * Read how far an install has got from Foundry's progress packet: one of its downloading or installing steps, with
 * how much of it is done. Its other steps, such as `complete`, say nothing of how far.
 * @param data - The packet, the progress event's `data`; read with care, as Foundry's types do not describe it
 * @returns How far, or `undefined` for any other packet
 */
export function progressOf(data: unknown): StepProgress | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const { step, pct } = data as Record<string, unknown>;
  const phase = typeof step === 'string' ? PHASES[step] : undefined;
  if (phase === undefined || typeof pct !== 'number' || !Number.isFinite(pct)) return undefined;
  return { phase, pct: Math.min(100, Math.max(0, Math.round(pct))) };
}

/**
 * Carry out a step.
 * @param game - The setup screen's `game`
 * @param guard - The guard, to let the installs through
 * @param step - The step; Foundry VTT's own update is not one of those carried out here
 * @param onProgress - Told how far an install has got, as Foundry says, each time that changes; only installs say
 * @returns Once done
 * @throws {Error} If it fails, saying why
 */
export async function runStep(
  game: SetupGame,
  guard: Guard,
  step: Exclude<RunStep, { kind: 'core' }>,
  onProgress?: (progress: StepProgress) => void,
): Promise<void> {
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
      let last: StepProgress | undefined;
      await guard.allowing(() =>
        installPackage.call(game, {
          type: step.type,
          id: step.id,
          manifest,
          dependencies: false,
          notify: false,
          // A public option of Foundry 14's installPackage, as documented there.
          onProgress: event => {
            const progress = progressOf(event.data);
            if (progress === undefined || (progress.phase === last?.phase && progress.pct === last.pct)) return;
            last = progress;
            onProgress?.(progress);
          },
        }),
      );
      return;
    }
    case 'uninstall':
      await guard.allowing(() => uninstallPackage(game, step.type, step.id));
  }
}
