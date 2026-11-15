export interface ClockTimer {
  readonly cancel: () => void;
}

/** The clock's timers, injected so that a spec fires them by hand and never waits a real interval. */
export interface ClockTimers {
  readonly start: (callback: () => void, delayMilliseconds: number) => ClockTimer;
}

/** The clock, read only here: every `now` a module is handed in production comes from this file, so a spec hands in its own. */
export function stampOfNow(): string {
  return new Date().toISOString();
}

/** Milliseconds on a monotonic clock, which a change of the wall clock never moves: for a bounded life, never for a stamp. */
export function monotonicMillisecondsOfNow(): number {
  return performance.now();
}

/** The real timers, over the runtime's own. */
export function realClockTimers(): ClockTimers {
  return {
    start: (callback, delayMilliseconds) => {
      const timeout = setTimeout(callback, delayMilliseconds);
      return { cancel: () => clearTimeout(timeout) };
    },
  };
}
