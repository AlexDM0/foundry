/** The wall clock, read only here: every `now` a module is handed in production comes from this file, so a spec hands in its own. */
export function stampOfNow(): string {
  return new Date().toISOString();
}
