/**
 * The page's clock, for display only: the ages, clock times, countdowns and running times a view prints. It holds one reading and takes a
 * new one on a schedule while anyone listens, so a view reads it through React's external-store hook and an age moves on by itself. It
 * ticks every second only while someone holds second ticks, as while a countdown in seconds shows. No order and no decision reads it.
 */
export interface PageClock {
  /** The reading in epoch milliseconds, the same value until the next tick. */
  readonly now:             () => number;
  readonly subscribe:       (listener: () => void) => () => void;
  /** Ticks every second until every hold is released by its answer. */
  readonly holdSecondTicks: () => () => void;
  /** The time zone a clock time is printed in; `undefined` is the browser's own. */
  readonly timeZone:        string | undefined;
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

/** A countdown or a running time is printed in whole seconds. */
const PAGE_CLOCK_SECOND_TICK_MILLISECONDS = 1_000;

function create({ readClock, scheduleRepeating, timeZone }: PageClockSurroundings): PageClock {
  const listeners = new Set<() => void>();
  let reading = readClock();
  let cancelTicks: (() => void) | null = null;
  let secondTickHolds = 0;

  const tick = (): void => {
    reading = readClock();
    [...listeners].forEach((listener) => listener());
  };

  const stopTicking = (): void => {
    cancelTicks?.();
    cancelTicks = null;
  };

  const startTicking = (): void => {
    cancelTicks = scheduleRepeating(tick, secondTickHolds > 0 ? PAGE_CLOCK_SECOND_TICK_MILLISECONDS : PAGE_CLOCK_TICK_MILLISECONDS);
  };

  /** A running schedule moves to the interval the holds now ask for, from a fresh reading. */
  const rescheduleWhileTicking = (): void => {
    if (cancelTicks === null) return;
    stopTicking();
    tick();
    startTicking();
  };

  return {
    now:       () => reading,
    subscribe: (listener) => {
      listeners.add(listener);
      if (cancelTicks === null) {
        reading = readClock();
        startTicking();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopTicking();
      };
    },
    holdSecondTicks: () => {
      secondTickHolds += 1;
      if (secondTickHolds === 1) rescheduleWhileTicking();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        secondTickHolds -= 1;
        if (secondTickHolds === 0) rescheduleWhileTicking();
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
  PAGE_CLOCK_SECOND_TICK_MILLISECONDS,
  create,
  browserSurroundings,
} as const;
