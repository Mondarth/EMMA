/**
 * A setup kit for the tests, made of the resolver the EMMA module builds its own from (see the module's
 * `src/setup-kit.ts`). Its badges stand in for Foundry's `getVersionBadge`, which needs Foundry's client: coloured by
 * the verdict as Foundry colours it, with the verdict and the setup's packages in the tooltip.
 */
import type { ReleaseCheck } from '@mondarth/fvtt-resolver';
import type { KitBadge, SetupKit } from '@mondarth/emma-core/setup-kit';
import { SETUP_KIT_API } from '@mondarth/emma-core/setup-kit';
import * as resolver from '@mondarth/fvtt-resolver';
import * as sources from '@mondarth/fvtt-resolver/sources';

/**
 * A badge for a release, coloured by its verdict.
 * @param checked - What checking found of the release
 * @param setup - What checking found of every package in its setup
 * @returns The badge
 */
export function stubBadge(checked: ReleaseCheck, setup: readonly ReleaseCheck[]): KitBadge {
  const { availability } = checked;
  const { AVAILABILITY, isUnavailable } = resolver;
  const type: KitBadge['type'] = isUnavailable(availability)
    ? 'error'
    : availability === AVAILABILITY.VERIFIED
      ? 'success'
      : availability === AVAILABILITY.UNKNOWN
        ? 'neutral'
        : 'warning';
  const text = `${String(availability)} in ${setup.map(({ release }) => resolver.packageKey(release.package)).join(', ')}`;
  return { type, icon: 'fa-solid fa-code-branch', tooltip: text, text };
}

/** The kit. */
export const KIT: SetupKit = { api: SETUP_KIT_API, resolver, sources, badges: { releaseBadge: stubBadge } };
