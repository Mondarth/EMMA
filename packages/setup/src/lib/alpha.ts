/**
 * EMMA's alpha testing, which the EMMA extension warns of in its footer, and which the user must acknowledge for each
 * new version before running a plan.
 */

/** Whether EMMA is in alpha testing. Set it to `false` once EMMA leaves alpha testing, removing the warning. */
export const IN_ALPHA: boolean = true;

/** The version of the EMMA extension, as the browser extension's release stamps it. */
export const EMMA_VERSION: string = __EMMA_EXTENSION_VERSION__;

/** The page about EMMA's alpha testing: its documentation, its Discord server, and what the alpha period means. */
export const ALPHA_PAGE = 'https://mondarth.github.io/EMMA/alpha.html';
