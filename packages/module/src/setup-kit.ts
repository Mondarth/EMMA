/**
 * The setup kit, built as `dist/emma-setup-kit.js` (see `vite.kit.config.ts`): the code the EMMA extension on the setup
 * screen imports from the installed module rather than carry its own copy. Its API and how its version is checked are
 * in `@mondarth/emma-core/setup-kit`; the manifest names it in `flags.setupKit`, which a unit test keeps in step with
 * {@link SETUP_KIT_API}. Never loaded in a world.
 */
import type { SetupKit } from '@mondarth/emma-core/setup-kit';
import { SETUP_KIT_API } from '@mondarth/emma-core/setup-kit';
import {
  AVAILABILITY,
  CORE,
  check,
  coreAvailability,
  isNewerVersion,
  isUnavailable,
  looksLikePrerelease,
  packageKey,
  resolveInRounds,
  sameVersion,
} from '@mondarth/fvtt-resolver';
import {
  catalogueSource,
  foundryCoreReleases,
  foundryIndexSource,
  githubSource,
  gitlabSource,
  httpClient,
  localSource,
  manifestUrlSource,
  memoryCache,
  proxiedFetch,
  sourceSet,
} from '@mondarth/fvtt-resolver/sources';

import { releaseBadge } from './module/adapters/badges';

/** The kit. */
const kit: SetupKit = {
  api: SETUP_KIT_API,
  resolver: {
    AVAILABILITY,
    CORE,
    check,
    coreAvailability,
    isNewerVersion,
    isUnavailable,
    looksLikePrerelease,
    packageKey,
    resolveInRounds,
    sameVersion,
  },
  sources: {
    catalogueSource,
    foundryCoreReleases,
    foundryIndexSource,
    githubSource,
    gitlabSource,
    httpClient,
    localSource,
    manifestUrlSource,
    memoryCache,
    proxiedFetch,
    sourceSet,
  },
  badges: { releaseBadge },
};

export default kit;
