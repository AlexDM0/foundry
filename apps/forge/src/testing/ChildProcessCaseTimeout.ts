/**
 * The one case deadline, for every case that waits on a child process, by `Bun.spawn` or `Bun.spawnSync`, directly or through a helper;
 * `src/testing/SharedCaseDeadlinePreload.ts` puts every spec file on it. On a loaded machine a child can take seconds just to start, a blocking
 * `spawnSync` counts against the deadline, and Bun's runner kills a child at it. The verdict is the child's result, never this number, which is
 * sized for the case that spawns most: a crash matrix row.
 */
export const CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS = 90_000;
