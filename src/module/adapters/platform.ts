/**
 * The only place EMMA reads which Foundry version and game system it is running on, so the UI can show them without
 * reaching into Foundry.
 */

/** The Foundry version and game system in use. */
export interface Platform {
  /** The Foundry version, such as `14.368`. */
  readonly core: string;
  /** The game system in use. */
  readonly system: {
    readonly id: string;
    readonly title: string;
    readonly version: string;
  };
}

/**
 * Read the Foundry version and the game system in use.
 * @returns The platform as it is now
 */
export function readPlatform(): Platform {
  const { id, title, version } = game.system;
  return { core: game.version, system: { id, title, version } };
}

/**
 * Whether the current user is a GM. Hypothetical mode is offered to GMs only.
 * @returns `true` for a GM; `false` for anyone else, or before the user is known
 */
export function isGM(): boolean {
  return game.user?.isGM === true;
}
