/**
 * Installs the EMMA module from the setup screen, or updates it, for the EMMA extension's updates, which need its
 * setup kit (see `setup-kit.ts`). It goes through Foundry's own `game.installPackage`, as Foundry's Install button
 * does, with the guard letting it through. Foundry then asks the user about the module's dependencies, such as
 * libWrapper, as it would after its own install.
 */
import type { Guard } from './guard';
import type { SetupGame } from './setup-game';
import { EMMA_MANIFEST, EMMA_MODULE_ID } from './setup-kit';

/**
 * Install the EMMA module, or update it to the version its published manifest gives.
 * @param game - The setup screen's `game`
 * @param guard - The guard, to let the installs through
 * @returns Once installed, and its dependencies seen to
 * @throws Error if Foundry cannot install packages here, or the install fails; Foundry tells the user why
 */
export async function installEmma(game: SetupGame, guard: Guard): Promise<void> {
  const { installPackage, installDependencies } = game;
  if (installPackage === undefined) throw new Error('Foundry offers no way to install packages here');
  await guard.allowing(async () => {
    // Foundry would ask about the dependencies without waiting, when the guard no longer lets them through.
    const pkg = await installPackage.call(game, {
      type: 'module',
      id: EMMA_MODULE_ID,
      manifest: EMMA_MANIFEST,
      dependencies: false,
    });
    await installDependencies?.call(game, pkg);
  });
}
