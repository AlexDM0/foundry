/**
 * `gate-profiles.json` beside the progress file: the gate profiles User started, each one gate in one phase, run once. A profile only
 * informs: it never records a green or a gate run, and nothing waits on it.
 */
import type { GatePhase }               from './GatePhase.ts';
import type { GateCacheReport }         from './Job.ts';
import type { EntityKey, PipelineStep } from './Pipeline.ts';
import type { GateProfileRunState }     from './PipelineFacts.ts';

/** How a run that started ended by itself; a stop is `stopped`, which has no result. */
export type GateProfileRunEnding = 'passed' | 'red' | 'cannot-run' | 'timed-out';

/** How a run ended, what it took, and what the gate reported of its cache; a gate that reported nothing has `null`. */
export interface GateProfileRunEnd {
  ending:              GateProfileRunEnding;
  elapsedMilliseconds: number;
  cacheReport:         GateCacheReport | null;
}

/** The gate as it stood at User's press, without its `writes`: a profile may write only inside its worktree and the temporary folder. */
export interface ProfiledGate {
  name:     string;
  run:      string;
  in?:      string;
  network?: string[];
}

export interface GateProfileRun {
  /** `P1`, `P2`, …, unique per board and never reused. */
  profileRunId:        string;
  /** The setup record whose draft the gate came from; `null` for a gate of the stored pipeline. */
  setupId:             string | null;
  /**
   * The entity whose gate it is, its gate's and prepare steps' folders taken from the repository's root; absent on a pipeline without
   * entities, and stored only once set. With the gate name and the phase, what the run is kept by.
   */
  entity?:             EntityKey;
  phase:               GatePhase;
  gate:                ProfiledGate;
  /** The content hash of the gate's `run`, `in` and `network`: with the phase and the gate name, what the run is kept by. */
  gateHash:            string;
  /** The pipeline's prepare steps at the press, which run before the gate. */
  prepare:             PipelineStep[];
  state:               GateProfileRunState;
  /** User pressed Stop while the run was running; Hephaestus ends its process tree and records `stopped`. */
  stopRequested:       boolean;
  /** Recorded and shown only; `null` until the run ended by itself. */
  elapsedMilliseconds: number | null;
  /** What the gate reported of its cache when the run ended by itself; absent while it reported nothing, and stored only once set. */
  cacheReport?:        GateCacheReport;
}

export interface GateProfiles {
  formatVersion: 1;
  /** The number the next run takes, never wound back. */
  nextRunNumber: number;
  /** The newest run of each gate and phase, in the order they were queued. */
  runs:          GateProfileRun[];
  /** Keys this build does not know, kept in order so a round trip stays byte-identical. */
  extra:         Array<[string, unknown]>;
}

/** `gate-profiles.json` as read: no run yet, the runs, or a file the board cannot use, which nothing writes over. */
export type GateProfilesReading =
  | { verdict: 'absent' }
  | { verdict: 'readable'; profiles: GateProfiles }
  | { verdict: 'malformed'; reason: string };

/** User's press: one gate in one phase, with the prepare steps of the pipeline the gate came from, and its entity on a forge over entities. */
export interface GateProfileRequest {
  setupId: string | null;
  entity?: EntityKey;
  phase:   GatePhase;
  gate:    ProfiledGate;
  prepare: readonly PipelineStep[];
}
