/**
 * Keeps the world record (see `lib/world-record.ts`) in step with the world: it is checked when the world starts, after
 * each save from EMMA, and before a GM logs out or returns to setup, and written only when it is missing or says
 * something else.
 */
import {
  canKeepWorldRecord,
  describeWorld,
  isActiveGM,
  readWorldRecord,
  writeWorldRecord,
} from '@module/adapters/world-record';
import { beforeLeavingWorld } from '@module/foundry/session-exit';
import { log } from '@module/lib/logger';
import { recordHolds, stampRecord } from '@module/lib/world-record';

/** What checking the record did. */
export type WorldRecordOutcome = 'written' | 'current' | 'skipped' | 'failed';

/** The check in progress, so checks run one after another and never write over each other. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Check the world record against the world, writing it if it is missing or says something else. Only a user who may
 * keep the record checks it. A failure is logged, never thrown, as the record must never stop the user's work.
 * @returns What the check did
 */
export function syncWorldRecord(): Promise<WorldRecordOutcome> {
  const next = queue.then(checkRecord);
  queue = next;
  return next;
}

/**
 * Check the record now. See {@link syncWorldRecord}.
 * @returns What the check did
 */
async function checkRecord(): Promise<WorldRecordOutcome> {
  if (!canKeepWorldRecord()) return 'skipped';
  try {
    const content = describeWorld();
    if (recordHolds(await readWorldRecord(), content)) return 'current';
    await writeWorldRecord(stampRecord(content, new Date()));
    log.debug('Wrote the world record');
    return 'written';
  } catch (error) {
    log.error('Unable to keep the world record', error);
    return 'failed';
  }
}

/**
 * Start keeping the world record, once the world is ready: the active GM checks it at once, and any user who may keep
 * it checks it again before logging out or returning to setup.
 */
export function startWorldRecord(): void {
  if (!canKeepWorldRecord()) return;
  beforeLeavingWorld(syncWorldRecord);
  if (isActiveGM()) void syncWorldRecord();
}
