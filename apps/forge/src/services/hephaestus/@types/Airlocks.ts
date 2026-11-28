import type { MergeDecisionProblem }           from '../../../adapters/MergeDecisionWording.ts';
import type { KeptAirlockFacts }               from '../../../adapters/airlock-facts/AirlockFactsIngestion.ts';
import type { MergedTreeGate }                 from '../../../adapters/gate-outcome/@types/MergedTreeGate.ts';
import type { GatePhase }                      from '../../../domain/tracker-model/@types/GatePhase.ts';
import type { Job }                            from '../../../domain/tracker-model/@types/Job.ts';
import type { EntityKey }                      from '../../../domain/tracker-model/@types/Pipeline.ts';
import type { MainConstitutionReading }        from '../../../domain/tracker-model/@types/PipelineSetup.ts';
import type { DecisionDraft, DecisionWording } from '../../../domain/tracker-model/@types/PlaybookStep.ts';
import type { Board }                          from '../../../domain/tracker-model/Board.ts';
import type { GitProblem }                     from '../../../lib/git/@types/GitProblem.ts';
import type { ConstitutionCommitProblem }      from '../../../shared/@types/ConstitutionCommitProblem.ts';
import type { BranchNames }                    from '../../../shared/BranchNames.ts';
import type { AirlockLimits }                  from '../../../shared/constants/AirlockLimits.ts';
import type { AgentNaming }                    from '../../lifecycle/@types/CustomsSubject.ts';
import type { SharedRepositoryLanding }        from '../../lifecycle/Landing.ts';
import type { KeptAirlockFactsAnswer }         from '../AirlockFactsFile.ts';

export interface AirlockHold {
  board: Board;
  at:    string;
}

/** One fenced `writeTracker` hold: the caller checks its Hephaestus lock after it. */
export type AirlockHoldRunner = <Result>(mutate: (hold: AirlockHold) => Result) => Promise<Result>;

/** What the merge agent's session reported and how many top-level calls it made, read from its event log. */
export interface MergeAgentReading {
  calls:  number;
  report: unknown;
}

export type MergedTreeGateAsk = (
  worktreePath: string, treeId: string, phase: GatePhase, gatedEntities: readonly EntityKey[] | undefined, ownerJobId: string | null
) => MergedTreeGate | 'running';

export interface AirlocksContext {
  /** The main checkout's root, where the main line is fast-forwarded and git runs: never a project folder, as git runs at a toplevel only. */
  repositoryRoot:          string;
  /**
   * Present for a tracker in a project folder of its repository: its landings take the repository's landing lock and are journaled, a
   * sibling's journaled landing requeues a slot silently, and a held main line waits only for the paths its fast-forward changes.
   */
  sharedRepository?:       SharedRepositoryLanding;
  /**
   * `ProjectLocation.projectPrefix`, present for a tracker in a project folder of its repository only: a conflict resolution is also held
   * to the data folders, the project's folder and its reach, and the agent configuration.
   */
  projectPrefix?:          string;
  mainLine:                string;
  branchNames:             BranchNames;
  /** Where the group worktrees and the refresh worktrees live, beside the ticket worktrees. */
  worktreesRoot:           string;
  worktreeOf:              (ticketId: string) => string;
  limits:                  AirlockLimits;
  /** With the per-job ref denies holding, a target moved by someone else requeues silently; an unconfined job may have moved it itself. */
  refDeniesHold:           boolean;
  hold:                    AirlockHoldRunner;
  /**
   * The gate of the tree with the gates of `phase`, read afresh as the run starts: `merge` for an Airlock's merged tree, the row's own phase
   * for a stale green. On a pipeline with entities `gatedEntities` names whose gates run: the landing's gate set, or the ticket's entity for
   * a stale green; absent, every entity's. The run goes on beside the pass, `running` until a later ask finds its outcome, which carries the
   * stamp of what it read. `ownerJobId` is the merge job whose slot waits on the run, `null` for a stale green's: a run whose owner left the
   * board stops.
   */
  mergedTreeGateOf:        MergedTreeGateAsk;
  /** The agent's configuration names, which a resolution may not change, and its attribution. */
  agentNaming:             AgentNaming;
  /** After the hold its outcome settled, the run's kept outcome goes, so the next gate of the same tree runs again. */
  mergedTreeGateSettled:   (worktreePath: string, treeId: string, phase: GatePhase, gatedEntities: readonly EntityKey[] | undefined, gate: MergedTreeGate) => void;
  /** Stops every merged-tree gate still running in the worktree and awaits its end: the slot that freed it no longer waits on its outcome. */
  stopMergedTreeGatesIn:   (worktreePath: string) => Promise<void>;
  mergeAgentReadingOf:     (job: Readonly<Job>) => MergeAgentReading;
  /** The lines the resolution at the worktree's HEAD changed against git's automatic merge; `null` when git cannot tell. */
  resolutionLinesOf:       (worktreePath: string) => number | null;
  /** The job's own child, an agent or a line, is alive. */
  childIsLive:             (job: Readonly<Job>) => boolean;
  stopMergeAgent:          (job: Readonly<Job>) => Promise<void>;
  /**
   * The start this Hephaestus serves after leaves interrupted work waiting (not a handover or a first start): its first sweep restores each
   * slot it finds with no live holder and holds its ticket for User's resume instead of requeuing it.
   */
  startHoldsOrphans?:      boolean;
  decisionWordingOf:       (draft: DecisionDraft) => DecisionWording;
  /** A problem as the merge-refused decision's stored note names it. */
  mergeDecisionSentenceOf: (problem: MergeDecisionProblem) => string;
  /** A constitution commit's git problem as the stored Apply refusal's `gitFailure` names it. */
  applyRefusalSentenceOf:  (problem: ConstitutionCommitProblem) => string;
  /** Keeps an Airlock incident's facts beside the merge job, for the agent its move or default launches once the incident is closed. */
  keepAirlockFacts:        (mergeJob: Readonly<Job>, facts: KeptAirlockFacts) => void;
  /** The facts kept beside the merge job: `absent` when none were kept, `unreadable` when the merge job's file cannot be read. */
  keptAirlockFactsOf:      (mergeJob: Readonly<Job>) => KeptAirlockFactsAnswer;
  /** The job's own folder, where a merge-gate fixer's red handoff is written for its resumed session. */
  jobFolderOf:             (job: Readonly<Job>) => string;
  /** An ended job's folder, where a stale green turned red is written for the next session of its kind. */
  jobFolderOfId:           (jobId: string) => string;
  /** How often a fixer whose fix left the merged tree red is resumed before the merge parks. */
  redHandoffResumes:       number;
  /** `pause` opens no new slot; a slot already open finishes. */
  dispatchIsStopped:       () => boolean;
  /** A removal git declined after a refresh or a release: Hephaestus logs it and shows it as a notice while the leftover stands. */
  reportDeclinedCleanup:   (declined: DeclinedCleanup) => void;
  /** A constitution on the main line's tip as git answers for its project path, read afresh at each call. */
  mainConstitutionOf:      (constitutionPath: string) => MainConstitutionReading;
  /** The repository sets `commit.gpgsign`, so a constitution commit git cannot make is an unsigned one. */
  repositorySignsCommits:  () => boolean;
}

export interface DeclinedCleanup {
  cleanup:     'refresh' | 'release';
  groupBranch: string;
  /** Why git declined, as `GroupWorktrees` hands it back. */
  problem:     GitProblem;
}

/**
 * The `dirty-main-checkout` notice: the target checkout's branch, or the files blocking the fast-forward. With `heldFiles`, the
 * `target-file-held` notice instead: files another process holds open, which are never the owner's changes.
 */
export interface HeldTarget {
  target:        string;
  branch:        string | null;
  blockingFiles: readonly string[];
  heldFiles:     readonly string[];
}

export interface Airlocks {
  /** Advances every slot as far as it goes without waiting, then allocates; resolves with the targets whose landings wait. */
  sweep: () => Promise<readonly HeldTarget[]>;
}
