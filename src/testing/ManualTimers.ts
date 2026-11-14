/**
 * Timers a spec fires by hand in place of the clock's, so no spec waits a real interval. A spec waits for a timer to be started, never for
 * time to pass, and counts the timers still pending after a stop. Test-only.
 */
import type { WatchTimer, WatchTimers } from '../services/ForgeWatch.ts';

export interface ManualTimers extends WatchTimers {
  /** The delay of every timer started and neither fired nor cancelled, in the order they were started. */
  readonly pendingDelays: () => readonly number[];
  /** Fires every pending timer of this delay, skipping one an earlier callback cancelled, and answers how many fired; none pending fails the spec. */
  readonly fire:          (delayMilliseconds: number) => number;
  /** Settles once a timer of this delay is pending, at once when one already is. */
  readonly untilPending:  (delayMilliseconds: number) => Promise<void>;
}

interface PendingTimer {
  readonly callback:          () => void;
  readonly delayMilliseconds: number;
}

export function manualTimers(): ManualTimers {
  const pendingTimers: PendingTimer[] = [];
  const waiters: { readonly delayMilliseconds: number; readonly resolve: () => void }[] = [];

  function start(callback: () => void, delayMilliseconds: number): WatchTimer {
    const pendingTimer: PendingTimer = { callback, delayMilliseconds };
    pendingTimers.push(pendingTimer);
    for (const waiter of waiters.filter((candidate) => candidate.delayMilliseconds === delayMilliseconds)) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve();
    }
    return {
      cancel: () => {
        const index = pendingTimers.indexOf(pendingTimer);
        if (index !== -1) pendingTimers.splice(index, 1);
      },
    };
  }

  function pendingDelays(): readonly number[] {
    return pendingTimers.map((pendingTimer) => pendingTimer.delayMilliseconds);
  }

  function fire(delayMilliseconds: number): number {
    const dueTimers = pendingTimers.filter((pendingTimer) => pendingTimer.delayMilliseconds === delayMilliseconds);
    if (dueTimers.length === 0) throw new Error(`No timer of ${delayMilliseconds} ms is pending; pending: ${JSON.stringify(pendingDelays())}.`);
    let firedCount = 0;
    for (const dueTimer of dueTimers) {
      const index = pendingTimers.indexOf(dueTimer);
      // An earlier callback may have cancelled this one.
      if (index === -1) continue;
      pendingTimers.splice(index, 1);
      dueTimer.callback();
      firedCount += 1;
    }
    return firedCount;
  }

  function untilPending(delayMilliseconds: number): Promise<void> {
    if (pendingTimers.some((pendingTimer) => pendingTimer.delayMilliseconds === delayMilliseconds)) return Promise.resolve();
    return new Promise((resolve) => {
      waiters.push({ delayMilliseconds, resolve });
    });
  }

  return {
    start,
    pendingDelays,
    fire,
    untilPending,
  };
}
