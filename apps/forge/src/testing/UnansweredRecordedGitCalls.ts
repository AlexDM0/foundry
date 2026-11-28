/**
 * The git calls of a case that no recording answered, kept for the preload `src/testing/RecordedBoundariesGuard.ts` to fail the case on.
 * A preload's `afterEach` runs after a spec file's own, so the file's teardown has run by then; Bun skips the hooks after one that throws.
 */
const unansweredCalls: string[] = [];

export function noteUnansweredRecordedGitCalls(calls: readonly string[]): void {
  unansweredCalls.push(...calls);
}

/** Each call noted since the last take; the list is then empty. */
export function takeUnansweredRecordedGitCalls(): string[] {
  return unansweredCalls.splice(0);
}
