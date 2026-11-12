/**
 * The page's clock, for display only: the ages and clock times a view prints. It holds one reading and takes a new one on a schedule while
 * anyone listens, so a view reads it through React's external-store hook and an age moves on by itself. No order and no decision reads it.
 */
export interface PageClock {
  /** The reading in epoch milliseconds, the same value until the next tick. */
  readonly now:       () => number;
  readonly subscribe: (listener: () => void) => () => void;
  /** The time zone a clock time is printed in; `undefined` is the browser's own. */
  readonly timeZone:  string | undefined;
}

/** The browser around the clock, so a spec can drive each tick. */
export interface PageClockSurroundings {
  readonly readClock:         () => number;
  /** Runs the task every interval until the answer cancels it. */
  readonly scheduleRepeating: (task: () => void, intervalMilliseconds: number) => () => void;
  readonly timeZone:          string | undefined;
}

/** An age is printed in whole minutes, so a tick well under a minute keeps it right to the minute. */
const PAGE_CLOCK_TICK_MILLISECONDS = 10_000;

function create({ readClock, scheduleRepeating, timeZone }: PageClockSurroundings): PageClock {
  const listeners = new Set<() => void>();
  let reading = readClock();
  let cancelTicks: (() => void) | null = null;

  const tick = (): void => {
    reading = readClock();
    [...listeners].forEach((listener) => listener());
  };

  return {
    now:       () => reading,
    subscribe: (listener) => {
      listeners.add(listener);
      if (cancelTicks === null) {
        reading = readClock();
        cancelTicks = scheduleRepeating(tick, PAGE_CLOCK_TICK_MILLISECONDS);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0 || cancelTicks === null) return;
        cancelTicks();
        cancelTicks = null;
      };
    },
    timeZone,
  };
}

function browserSurroundings(): PageClockSurroundings {
  return {
    readClock:         () => Date.now(),
    scheduleRepeating: (task, intervalMilliseconds) => {
      const timer = setInterval(task, intervalMilliseconds);
      return () => clearInterval(timer);
    },
    timeZone: undefined,
  };
}

export const PageClock = {
  PAGE_CLOCK_TICK_MILLISECONDS,
  create,
  browserSurroundings,
} as const;
