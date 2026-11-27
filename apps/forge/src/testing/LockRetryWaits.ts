/**
 * Runs a case around a held tracker lock without the wall time. `lockRetryWaitsDuring` resolves and records every `Bun.sleep` at once, so
 * the case asserts the waits instead of sitting through them. `parkingLockRetries` parks each rival's first retry, counted, until the action
 * ends, so a hold ends on a queued state however late the rivals arrive, and no retry budget runs out meanwhile.
 */
import { spyOn } from 'bun:test';

import { LIMITS } from '../shared/constants/Limits.ts';

export async function parkingLockRetries<ActionResult>(action: (parkedRetries: () => number) => Promise<ActionResult>): Promise<ActionResult> {
  const realSleep = Bun.sleep;
  const parkedWakes: (() => void)[] = [];
  const sleepSpy = spyOn(Bun, 'sleep').mockImplementation((requested: number | Date) => {
    if (requested !== LIMITS.LOCK_RETRY_INTERVAL_MILLISECONDS) return realSleep(requested);
    return new Promise((resolve) => {
      parkedWakes.push(resolve);
    });
  });
  try {
    return await action(() => parkedWakes.length);
  } finally {
    sleepSpy.mockRestore();
    for (const wake of parkedWakes) wake();
  }
}

export interface LockRetryWaitsResult<ActionResult> {
  outcome:           { settled: 'fulfilled'; value: ActionResult } | { settled: 'rejected'; reason: unknown };
  sleepMilliseconds: number[];
}

export async function lockRetryWaitsDuring<ActionResult>(action: () => Promise<ActionResult>): Promise<LockRetryWaitsResult<ActionResult>> {
  const sleepMilliseconds: number[] = [];
  const sleepSpy = spyOn(Bun, 'sleep').mockImplementation((requested: number | Date) => {
    sleepMilliseconds.push(typeof requested === 'number' ? requested : requested.getTime() - Date.now());
    return Promise.resolve();
  });
  try {
    return { outcome: { settled: 'fulfilled', value: await action() }, sleepMilliseconds };
  } catch (reason) {
    return { outcome: { settled: 'rejected', reason }, sleepMilliseconds };
  } finally {
    sleepSpy.mockRestore();
  }
}
