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
import { reportChanges } from '@module/app/startup-changes';
import { log } from '@module/lib/logger';
import type { WorldRecord, WorldRecordContent } from '@mondarth/emma-core/world-record';
import {
  hasChanges,
  parseWorldRecord,
  recordChanges,
  recordHolds,
  stampRecord,
} from '@mondarth/emma-core/world-record';

/** What checking the record did. */
export type WorldRecordOutcome = 'written' | 'current' | 'skipped' | 'failed';

/** The check in progress, so checks run one after another and never write over each other. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Check the world record against the world, writing it if it is missing or says something else. Only a user who may
 * keep the record checks it. A failure is logged, never thrown, as the record must never stop the user's work.
 * @param options - How to check
 * @param options.report - Whether to tell the user first what changed since the record was written, as at startup
 * @returns What the check did
 */
export function syncWorldRecord(options: { report?: boolean } = {}): Promise<WorldRecordOutcome> {
  const next = queue.then(() => checkRecord(options.report === true));
  queue = next;
  return next;
}

/**
 * Check the record now. See {@link syncWorldRecord}.
 * @param report - Whether to tell the user what changed since the record was written, before it is written again
 * @returns What the check did
 */
async function checkRecord(report: boolean): Promise<WorldRecordOutcome> {
  if (!canKeepWorldRecord()) return 'skipped';
  try {
    const content = describeWorld();
    const saved = await readWorldRecord();
    if (recordHolds(saved, content)) return 'current';
    const recorded = parseWorldRecord(saved);
    if (report && recorded !== undefined) await tellChanges(recorded, content);
    await writeWorldRecord(stampRecord(content, new Date()));
    log.debug('Wrote the world record');
    return 'written';
  } catch (error) {
    log.error('Unable to keep the world record', error);
    return 'failed';
  }
}

/**
 * Tell the user what changed since the record was written, if anything did. A failure is logged, never thrown, so the
 * record is still written.
 * @param recorded - The record, as last written
 * @param content - What it says now
 */
async function tellChanges(recorded: WorldRecord, content: WorldRecordContent): Promise<void> {
  const changes = recordChanges(recorded, content);
  if (!hasChanges(changes)) return;
  try {
    await reportChanges(changes, recorded.updated);
  } catch (error) {
    log.error('Unable to report what changed since the world last ran', error);
  }
}

/**
 * Start keeping the world record, once the world is ready: the active GM checks it at once, and any user who may keep
 * it checks it again before logging out or returning to setup.
 */
export function startWorldRecord(): void {
  if (!canKeepWorldRecord()) return;
  beforeLeavingWorld(syncWorldRecord);
  // Before the record is written again, the active GM is told what changed since the world last ran.
  if (isActiveGM()) void syncWorldRecord({ report: true });
}
