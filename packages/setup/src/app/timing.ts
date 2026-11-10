/**
 * Research only (to-do 41): how long the resolver keeps the page busy, in the dev server alone. It times each call to
 * the resolver's heavy functions and the planner's, gathers the calls of one burst of work, and logs a summary once
 * the burst is over; it also records the longest stretches the main thread was blocked, where the browser says. It
 * keeps what the last search was given, for `__emmaDump()` to save, so that the solves can be replayed outside the
 * browser. Never in a release: `start.ts` uses it only when `import.meta.env.DEV`.
 */
import type { KitResolver } from '@mondarth/emma-core/setup-kit';

import type { Overview } from '../lib/overview';
import type { Planner } from '../lib/plans';

/** One kind of call, as a burst gathered it. */
interface CallStats {
  count: number;
  totalMs: number;
  slowestMs: number;
}

/** A burst of work: calls that came less than {@link QUIET_MS} apart. */
interface Burst {
  readonly startedAt: number;
  readonly calls: Map<string, CallStats>;
  readonly blocks: number[];
  label?: string;
}

/** How long without a call ends a burst, in milliseconds. */
const QUIET_MS = 1000;

let burst: Burst | undefined;
let quiet: ReturnType<typeof setTimeout> | undefined;
const summaries: object[] = [];
let kept: { overview: Overview; universe: unknown } | undefined;
// The name given to the next burst, before it begins.
let nextLabel: string | undefined;

/**
 * Start a burst, or keep the one going.
 * @returns The burst
 */
function inBurst(): Burst {
  if (burst === undefined) {
    burst = {
      startedAt: performance.now(),
      calls: new Map(),
      blocks: [],
      ...(nextLabel !== undefined && { label: nextLabel }),
    };
    nextLabel = undefined;
  }
  clearTimeout(quiet);
  quiet = setTimeout(flush, QUIET_MS);
  return burst;
}

/**
 * Record one call's time.
 * @param name - What was called
 * @param ms - How long it took
 */
function record(name: string, ms: number): void {
  const stats = inBurst().calls.get(name) ?? { count: 0, totalMs: 0, slowestMs: 0 };
  stats.count++;
  stats.totalMs += ms;
  stats.slowestMs = Math.max(stats.slowestMs, ms);
  inBurst().calls.set(name, stats);
}

/** Log the burst that has ended, and keep it for the dump. */
function flush(): void {
  const done = burst;
  burst = undefined;
  if (done === undefined) return;
  const wallMs = performance.now() - done.startedAt - QUIET_MS;
  const calls = Object.fromEntries(
    [...done.calls].map(([name, { count, totalMs, slowestMs }]) => [
      name,
      { count, totalMs: Math.round(totalMs), slowestMs: Math.round(slowestMs) },
    ]),
  );
  const blocks = [...done.blocks].sort((a, b) => b - a);
  const summary = {
    label: done.label ?? 'unlabelled',
    wallMs: Math.round(wallMs),
    calls,
    longTasks: {
      count: blocks.length,
      longestMs: Math.round(blocks[0] ?? 0),
      over200ms: blocks.filter(ms => ms > 200).length,
    },
  };
  summaries.push(summary);
  console.info('[EMMA timing]', JSON.stringify(summary));
}

/**
 * Time a function: an async one to when it settles.
 * @param name - What it is called in the summary
 * @param fn - The function
 * @returns The function, timed
 */
function timed<A extends unknown[], R>(name: string, fn: (...args: A) => R): (...args: A) => R {
  return (...args: A): R => {
    const start = performance.now();
    const result = fn(...args);
    if (result instanceof Promise) {
      void result.finally(() => {
        record(name, performance.now() - start);
      });
    } else record(name, performance.now() - start);
    return result;
  };
}

/** Record the main thread's long tasks, where the browser reports them (Chromium does; Firefox does not). */
export function watchLongTasks(): void {
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) inBurst().blocks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    console.info('[EMMA timing] This browser does not report long tasks; only call times are recorded.');
  }
}

/**
 * The resolver, its heavy functions timed.
 * @param resolver - The kit's resolver
 * @returns It, timed
 */
export function timedResolver(resolver: KitResolver): KitResolver {
  return {
    ...resolver,
    resolveInRounds: timed('resolveInRounds', resolver.resolveInRounds),
    check: timed('check', resolver.check),
    explain: timed('explain', resolver.explain),
  };
}

/**
 * A planner, its solving calls timed.
 * @param planner - The planner
 * @returns It, timed
 */
export function timedPlanner(planner: Planner): Planner {
  return {
    ...planner,
    complete: timed('planner.complete', planner.complete.bind(planner)),
    plan: timed('planner.plan', planner.plan.bind(planner)),
    whyNotTaken: timed('planner.whyNotTaken', planner.whyNotTaken.bind(planner)),
    add: timed('planner.add', planner.add.bind(planner)),
  };
}

/**
 * Time the whole of a search, labelling the burst it is in.
 * @param search - The search
 * @returns Once it is done
 */
export async function timedSearch<T>(search: () => Promise<T>): Promise<T> {
  inBurst().label ??= 'search';
  const start = performance.now();
  try {
    return await search();
  } finally {
    record('findUpdates (whole search)', performance.now() - start);
  }
}

/**
 * Keep what the last search was given, for the dump.
 * @param overview - The installation
 * @param universe - The releases and builds found
 */
export function keepForDump(overview: Overview, universe: unknown): void {
  kept = { overview, universe };
}

/** Offer `__emmaDump()` and `__emmaLabel(text)` on the page, for the research. */
export function offerConsoleHelpers(): void {
  Object.assign(globalThis, {
    /** Save what the last search was given, and the timings so far, as a JSON file. */
    __emmaDump: () => {
      const text = JSON.stringify({ ...kept, timings: summaries }, null, 1);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      link.download = `emma-timing-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.json`;
      link.click();
      console.info('[EMMA timing] Saved', link.download, `(${Math.round(text.length / 1024)} KB)`);
    },
    /**
     * Name the next burst of work, such as "best versions", or the one under way, if any.
     * @param text - The name
     */
    __emmaLabel: (text: string) => {
      if (burst === undefined) nextLabel = text;
      else burst.label = text;
    },
  });
}
