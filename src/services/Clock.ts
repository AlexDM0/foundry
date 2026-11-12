/** The clock, read only here: every `now` a module is handed in production comes from this file, so a spec hands in its own. */
export function stampOfNow(): string {
  return new Date().toISOString();
}

/** Milliseconds on a monotonic clock, which a change of the wall clock never moves: for a bounded life, never for a stamp. */
export function monotonicMillisecondsOfNow(): number {
  return performance.now();
}
