/** A role's permissions as neutral data, every path absolute; each adapter renders its own settings and flags from it. */
export interface WorkerProfile {
  readonly writableRoots:            readonly string[];
  readonly deniedWritableRoots:      readonly string[];
  readonly deniedReadableRoots:      readonly string[];
  readonly bashNetworkDomains:       readonly string[];
  readonly webNetworkDomains:        readonly string[] | 'any' | 'none';
  /** The one folder outside the working directory the session may write. */
  readonly extraWritableDirectory:   string;
  /** Argv prefixes, such as `['git', 'commit']`. */
  readonly allowedCommandPrefixes:   readonly (readonly string[])[];
  readonly deniedCommandPrefixes:    readonly (readonly string[])[];
  readonly askUser:                  boolean;
  readonly skills:                   boolean;
  readonly subagents:                readonly AgentDefinition[];
  readonly attribution:              'none';
  /** The repository folder: instruction files in the folders above it never reach the session. */
  readonly instructionsRoot:         string;
  /**
   * The checkout a session started in a project folder below its root works on: Edit and Write reach all of it, as its sandbox does.
   * Absent, they reach the working directory.
   */
  readonly writeRoot?:               string;
  /**
   * The main checkout's folders above a checkout nested in it, whose instruction files and rules would reach the session beside the
   * checkout's own copies; absent when the session reads them as a session at its repository's root always has.
   */
  readonly nestedCheckoutAncestors?: readonly string[];
  /** The `core.hooksPath` the session's git runs with, whose `commit-msg` refuses an attribution trailer. */
  readonly gitHooksDirectory:        string;
  readonly commitSigning:            CommitSigning;
  /** The guard run before every shell and WebFetch call of a role with network domains; `null` renders none. */
  readonly networkDomainGuard:       NetworkDomainGuard | null;
  /** `none` gives the session no tool and no allow rule at all, for a session that only answers; absent, the vendor's tools under these rules. */
  readonly availableTools?:          'none';
}

/**
 * A program that denies a call naming a domain outside `allowedDomains`; its arguments already carry the list, and it is spawned with no
 * shell. `programPath` is the absolute path of a runtime, never a script whose shebang looks one up, its `arguments` beginning with the
 * script it runs; `null` when the guard cannot start: the adapter then denies every call it would check.
 */
export interface NetworkDomainGuard {
  readonly allowedDomains: readonly string[];
  readonly programPath:    string | null;
  readonly arguments:      readonly string[];
}

export interface AgentDefinition {
  readonly name:     string;
  readonly model:    string;
  readonly effort:   'low' | 'medium';
  readonly readOnly: boolean;
}

/**
 * How an agent's sandbox applies a path deny. `path-rules` matches a path when it is reached, so an absent path or a glob is denied once it
 * appears. `mount-points` puts a mount over each path at launch: an absent path gets an empty mount point on the host, which a killed sandbox
 * leaves behind, a glob covers only what exists at launch, and the mount count is bounded.
 */
export type SandboxDenyShape = 'path-rules' | 'mount-points';

/** The Unix sockets a signing agent needs, with its key folder readable and its private keys read-denied; or commits go unsigned. */
export type CommitSigning =
  | { readonly kind: 'agent-sockets'; readonly sockets: readonly string[] }
  | { readonly kind: 'unsigned' };
