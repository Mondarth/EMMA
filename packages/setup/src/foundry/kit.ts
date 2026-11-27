/**
 * The EMMA extension's kit: the package resolver, the catalogue's sources, and Foundry's version badges with EMMA's
 * opinion, built into the extension. Its update search needs nothing of the server, nor the EMMA module installed, and
 * runs no code but its own, as the browsers' extension stores require.
 *
 * Until the EMMA extension 0.16.0, it imported the same kit from the installed EMMA module (`packages/module/src/
 * setup-kit.ts`), which the module still builds, for the extensions released before.
 */
import type { SetupKit } from '@mondarth/emma-core/setup-kit';
import { SETUP_KIT_API } from '@mondarth/emma-core/setup-kit';
import {
  AVAILABILITY,
  CORE,
  check,
  chooseOrders,
  coreAvailability,
  describeReason,
  englishMessages,
  explain,
  isNewerVersion,
  isUnavailable,
  looksLikePrerelease,
  missingManifest,
  packageKey,
  releaseConstraints,
  resolveInRounds,
  sameVersion,
  withDefaults,
} from '@mondarth/fvtt-resolver';
import { catalogueSet, catalogueSource, localSource } from '@mondarth/fvtt-resolver/sources';

import { releaseBadge } from './release-badge';

/** The kit, as the EMMA extension carries it. */
export const KIT: SetupKit = {
  api: SETUP_KIT_API,
  resolver: {
    AVAILABILITY,
    CORE,
    check,
    chooseOrders,
    coreAvailability,
    describeReason,
    englishMessages,
    explain,
    isNewerVersion,
    isUnavailable,
    looksLikePrerelease,
    missingManifest,
    packageKey,
    releaseConstraints,
    resolveInRounds,
    sameVersion,
    withDefaults,
  },
  sources: { catalogueSet, catalogueSource, localSource },
  badges: { releaseBadge },
};
