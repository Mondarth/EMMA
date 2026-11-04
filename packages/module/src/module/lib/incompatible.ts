import type { Availability } from '@mondarth/fvtt-resolver';
import { AVAILABILITY, isUnavailable } from '@mondarth/fvtt-resolver';

/**
 * Whether a module's availability makes it incompatible, so that EMMA will not activate it: it cannot run with the
 * Foundry version in use, or misses what it needs, or none of the game systems it declares, at the versions it
 * declares, is the one in use, which Foundry badges "Incompatible Systems" though it only warns. A module that is only
 * unverified with this build or generation of Foundry, or whose compatibility is unknown, is not.
 * @param availability - Its availability code, as Foundry's and the resolver's are the same
 * @returns `true` if it is incompatible
 */
export function isIncompatible(availability: Availability): boolean {
  return availability === AVAILABILITY.UNVERIFIED_SYSTEM || isUnavailable(availability);
}
