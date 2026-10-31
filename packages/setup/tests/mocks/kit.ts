/**
 * A setup kit for the tests, made of the resolver the EMMA module builds its own from (see the module's
 * `src/setup-kit.ts`).
 */
import type { SetupKit } from '@mondarth/emma-core/setup-kit';
import { SETUP_KIT_API } from '@mondarth/emma-core/setup-kit';
import * as resolver from '@mondarth/fvtt-resolver';
import * as sources from '@mondarth/fvtt-resolver/sources';

/** The kit. */
export const KIT: SetupKit = { api: SETUP_KIT_API, resolver, sources };
