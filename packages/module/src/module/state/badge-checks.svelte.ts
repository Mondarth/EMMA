/**
 * Whose checks the badges outside hypothetical mode show: EMMA's, which judge the system and what each module requires
 * as well as the core, or Foundry's own, which judge the core alone. Kept in a user setting, and mirrored here so that
 * an open window follows a change at once.
 */

/** Whose checks the badges show. */
export type BadgeChecks = 'emma' | 'foundry';

/** The checks the badges show, read reactively. */
export const badgeChecks = $state<{ value: BadgeChecks }>({ value: 'emma' });

/**
 * Make the badges show these checks, as the setting now holds them.
 * @param checks - Whose checks
 */
export function setBadgeChecks(checks: BadgeChecks): void {
  badgeChecks.value = checks;
}
