import type { GateRunManifest }                                      from '../../../adapters/gate-manifest/GateRunManifestIngestion.ts';
import type { MainMergeResolution }                                  from '../../../adapters/main-resolution/MainMergeResolutionIngestion.ts';
import type { RedHandoffFacts }                                      from '../../../adapters/red-handoff/RedHandoffIngestion.ts';
import type { SandboxRefusal }                                       from '../../../adapters/sandbox-refusal/SandboxRefusalIngestion.ts';
import type { GateStepOutcome }                                      from '../../../adapters/step-verdict/StepVerdictIngestion.ts';
import type { ChildEnd }                                             from '../../../domain/talos/ChildRecord.ts';
import type { GateCacheReportOfGate, LostLineKind, PipelineStepRun } from '../../../domain/tracker-model/@types/Job.ts';
import type { MergeStepProblem }                                     from '../../../shared/@types/MergeStepProblem.ts';
import type { ReReviewVerdict }                                      from '../../lifecycle/MergeRun.ts';
import type { StoredFileUnreadable }                                 from '../StoredFileUnreadable.ts';

/** `worktree-unnormalised`: the fresh checkout already differs from its commit, as line-ending normalisation leaves it, so every gate would fail. */
export type SetupProgress = 'creating-worktree' | 'worktree-failed' | 'worktree-unnormalised' | 'installing' | 'install-failed' | 'installed';

export type GateProgress =
  | { verdict: 'pending' }
  /** The step at `stepIndex` of the run's manifest has yet to end, or to start while every gate slot of the machine is held. */
  | { verdict: 'running'; treeId: string; stepIndex: number }
  /**
   * `step` names the red step, `null` on a pass; `ran` is false when a review left the tree the build's gates passed. `manifest` is what
   * the run judged by: `null` when no gate ran, or when the run's manifest cannot be read, which no gate passes. `cacheReports` holds what
   * each gate that ended reported of its cache, and `stepRuns` each step line that ran with its run time, both in run order.
   */
  | {
    verdict:      'judged';
    treeId:       string;
    outcome:      GateStepOutcome;
    step:         string | null;
    output:       string;
    ran:          boolean;
    exitCode?:    number | null;
    manifest:     GateRunManifest | null;
    cacheReports: GateCacheReportOfGate[];
    stepRuns:     PipelineStepRun[];
  }
  /** A file the run reads could not be read: nothing of the run is judged or launched until a move on its incident. */
  | StoredFileUnreadable;

export interface BuildJobObservation {
  jobId:                 string;
  setup:                 SetupProgress;
  /** Each install step's line that ended, with its run time, while the job is `preparing`; the first that did not pass is the last. */
  installStepRuns:       PipelineStepRun[];
  /** Top-level assistant turns across every child instance of the job. */
  calls:                 number;
  /** The structured report of the newest `result`, `undefined` before one. */
  report:                unknown;
  agentEnd:              ChildEnd | 'lost' | null;
  gate:                  GateProgress;
  /** The gate, prepare or install line or the worker launch that confinement refused, `null` while none was, or its unreadable record. */
  sandboxRefusal:        SandboxRefusal | StoredFileUnreadable | null;
  /** Where a prepared review job stands in bringing its branch up to the target's tip; `not-checked` for every other job. */
  targetCatchUp:         TargetCatchUp;
  /** Where a job in `merging-main` stands; `null` for a job in any other state. */
  mainMerge:             MainMergeReading | null;
  /** The conflict re-reviewer working under the job; `null` while none is. */
  conflictReReview:      ConflictReReviewReading | null;
  /** The install or gate line the job waits on whose newest instance reads `lost`; absent while none does. */
  lostLine?:             LostLineKind;
  /** The job's own red handoff facts, which its hold's steps read, when they cannot be read; absent otherwise. */
  unreadableRedHandoff?: StoredFileUnreadable;
  /** Set while the job's current child instance was never launched, as a launch refused for a file it reads leaves it. */
  childIsUnlaunched?:    true;
}

/**
 * A review job's step between its install and its reviewer: the branch is checked against the target's tip, and one that lacks it gets the
 * target merged in and gated before the reviewer starts. `gating` waits on the step at `stepIndex`; `gated` carries the judged gate run.
 */
export type TargetCatchUp =
  | { verdict: 'not-checked' }
  | { verdict: 'up-to-date' }
  | { verdict: 'behind'; targetTip: string; branchTip: string }
  | { verdict: 'merging' }
  | { verdict: 'merge-ended' }
  | { verdict: 'merge-failed'; problem: MergeStepProblem }
  | { verdict: 'conflicted'; targetTip: string; conflictedFiles: string[] }
  | { verdict: 'gating'; stepIndex: number }
  | { verdict: 'gated'; targetTip: string; gate: Extract<GateProgress, { verdict: 'judged' }> }
  | StoredFileUnreadable;

/** What a builder sent back by its review's target catch-up is told: the conflicted merge, or the red gate on the merged tree. */
export type TargetCatchUpHandover =
  | { kind: 'conflict'; targetTip: string; conflictedFiles: string[] }
  | { kind: 'gate-red'; redHandoff: RedHandoffFacts };

/**
 * One round of a job in `merging-main`, the job's child instance: the target's tip checked against the worktree, merged in by a process
 * line child when the branch lacks it, then the merged tree gated in the job's own phase once the hold asks for it. `up-to-date` and `merged`
 * carry the tree the hold settles: a green current on it finishes the job, any other is gated first.
 */
export type MainMergeStep =
  /** A conflict re-reviewer works in the worktree: nothing else of the round is read until it ended. */
  | { verdict: 're-reviewing' }
  | { verdict: 'up-to-date'; treeId: string }
  | { verdict: 'behind'; targetTip: string; branchTip: string }
  | { verdict: 'merging' }
  | { verdict: 'merge-ended' }
  | { verdict: 'merge-failed'; problem: MergeStepProblem }
  | { verdict: 'conflicted'; targetTip: string; branchTip: string; conflictedFiles: string[] }
  | { verdict: 'merged'; treeId: string }
  | { verdict: 'gating'; stepIndex: number }
  | { verdict: 'gated'; gate: Extract<GateProgress, { verdict: 'judged' }> }
  | StoredFileUnreadable;

/** The conflict re-reviewer working under a job in `merging-main`, read like a session; its report is judged once it reached Customs. */
export interface ConflictReReviewReading {
  jobId:        string;
  calls:        number;
  sessionEnded: boolean;
  /** The resolution it is judged against cannot be read: it is judged by nothing until a move on the file's incident. */
  verdict:      ReReviewVerdict | StoredFileUnreadable | null;
}

export interface MainMergeReading {
  step:       MainMergeStep;
  /** Read only while the pipeline has `airlock.reReview`, which alone asks for a conflict re-review. */
  resolution: MainMergeResolution | null;
}
