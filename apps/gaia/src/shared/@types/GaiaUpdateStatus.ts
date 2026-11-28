/**
 * Where Gaia's own update stands: the clone Gaia runs from against its origin's main branch, an update on its way, and the restart that
 * runs it. Internal only, so it carries no version.
 */

export type GaiaUpdateState =
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'not-known'
  | 'updating'
  | 'restart-needed'
  | 'restarting';

/**
 * `origin-unreachable`: the fetch of origin's main failed. `not-a-clone`: Gaia's folder is in no git clone with an origin. `local-changes`
 * and `diverged`: the clone cannot be fast-forwarded. `forge-setup-failed`: forge's setup did not finish. `restart-not-started`: the
 * relaunch could not be started.
 */
export type GaiaUpdateFailure =
  | 'origin-unreachable'
  | 'not-a-clone'
  | 'local-changes'
  | 'diverged'
  | 'forge-setup-failed'
  | 'restart-not-started';

export interface GaiaUpdateStatus {
  readonly state:             GaiaUpdateState;
  /** The commits on origin's main the clone does not have; zero but for `available`. */
  readonly commitsBehind:     number;
  /** Why the last check, update or restart did not finish; `null` once one did. */
  readonly failure:           GaiaUpdateFailure | null;
  /** Whether Gaia can quit and reopen itself, as only a Gaia started from Gaia.app can. */
  readonly restartIsPossible: boolean;
}
