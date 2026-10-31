/**
 * The `GateConfinement` port: what confines a gate or install line, which runs worker-written code. The plan is neutral data; each adapter
 * turns it into its own mechanism. The package depends on `src/lib/atomic-file`.
 */
export interface ConfinementPlan {
  worktree:            string;
  /** The worktree's own `<common>/worktrees/<name>/`, whose index git refreshes; `null` for a main checkout. */
  worktreeAdminFolder: string | null;
  temporaryDirectory:  string | null;
  /** Resolved, each one already allowed. */
  writableCachePaths:  readonly string[];
  deniedWritableRoots: readonly string[];
  /** A `*` in a path matches within one path segment. */
  deniedReadableRoots: readonly string[];
  network:             boolean;
  /** Where an adapter that describes its confinement in a file keeps it; one that needs none leaves the path alone. */
  confinementFilePath: string;
}

export type ConfinementAvailability =
  | { readonly verdict: 'confined'; readonly mechanism: string }
  | { readonly verdict: 'unavailable'; readonly reason: string }
  | { readonly verdict: 'unconfined-by-design' };

export interface GateConfinement {
  availability(): ConfinementAvailability;
  /** `argv` unchanged whenever `availability()` is not `confined`. */
  confinedArgvOf(plan: ConfinementPlan, argv: readonly string[]): readonly string[];
}
