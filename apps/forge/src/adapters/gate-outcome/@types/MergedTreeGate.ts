import type { GateRunStamp }                                      from '../../../domain/tracker-model/@types/GatePhase.ts';
import type { GateOutcome, GateRunCacheReports, GateRunStepRuns } from '../../../domain/tracker-model/@types/Job.ts';
import type { EntityKey }                                         from '../../../domain/tracker-model/@types/Pipeline.ts';
import type { LineRefusal }                                       from '../../../shared/@types/LineRefusal.ts';

/** The merged tree's gate: its outcome and what the checks line printed, whose tail a merge-gate fixer is given. */
export interface MergedTreeGate {
  /** `setup-failed` when a prepare step did not exit 0, `sandbox-unavailable` when a line was refused: no gate judged the tree. */
  outcome:       GateOutcome | 'setup-failed' | 'sandbox-unavailable';
  /** The red gate or the failed or refused step; `null` on a pass. */
  step:          string | null;
  /** On a pipeline with entities, the entity whose gate or step that is; absent on a pass. */
  entity?:       EntityKey;
  output:        string;
  /** The phase and phase hash of the pipeline the run read as it started, which a row's green records; `null` when it read none. */
  stamp:         GateRunStamp | null;
  /** What each gate that ended reported of its cache; absent when no gate ran. */
  cacheReports?: GateRunCacheReports;
  /** Each step line that ran, with its run time; absent when none ran. */
  stepRuns?:     GateRunStepRuns;
}

/** A run's gate as it ends, before its writer stores it: a refused line carries its refusal, which the writer words as the stored `output`. */
export type MergedTreeGateRunEnd =
  | MergedTreeGate & { outcome: Exclude<MergedTreeGate['outcome'], 'sandbox-unavailable'> }
  | Omit<MergedTreeGate, 'outcome' | 'output'> & { outcome: 'sandbox-unavailable'; refusal: LineRefusal };
