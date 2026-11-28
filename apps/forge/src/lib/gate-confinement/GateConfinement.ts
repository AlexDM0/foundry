/**
 * The `GateConfinement` port: what confines a gate or install line, which runs worker-written code, and a session whose agent brings no
 * sandbox of its own. The plan is neutral data; each adapter turns it into its own mechanism. The package depends on `src/lib/atomic-file`.
 */
export interface ConfinementPlan {
  worktree:            string;
  /** Written below as `worktree` is; a line's plan has none, a session's names its profile's other roots and its agent's own folders. */
  writableRoots:       readonly string[];
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

/** Why no confinement can be had here; `processMessage` is the first line bwrap itself printed. */
export type ConfinementUnavailability =
  | { readonly cause: 'no-adapter'; readonly platformName: string }
  | { readonly cause: 'mechanism-unusable'; readonly mechanism: string }
  | { readonly cause: 'bubblewrap-not-on-search-path' }
  | { readonly cause: 'bubblewrap-version-unread'; readonly processMessage: string }
  | { readonly cause: 'bubblewrap-namespaces-refused'; readonly processMessage: string };

export type ConfinementAvailability =
  | { readonly verdict: 'confined'; readonly mechanism: string }
  | { readonly verdict: 'unavailable'; readonly unavailability: ConfinementUnavailability }
  | { readonly verdict: 'unconfined-by-design' };

export type ConfinementVerdict = ConfinementAvailability['verdict'];

export interface GateConfinement {
  availability(): ConfinementAvailability;
  /** What a worker session runs under on this platform when its agent's own sandbox applies its profile. */
  workerConfinement(): ConfinementVerdict;
  /** `argv` unchanged whenever `availability()` is not `confined`; only `confinedLineOf` may hand it to a child. */
  confinedArgvOf(plan: ConfinementPlan, argv: readonly string[]): readonly string[];
}
