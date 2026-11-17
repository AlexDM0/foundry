/**
 * A unit of the Overseer's agent work, stored in progress.json while it is unsettled so a restart reads every job from disk. Only what the
 * Overseer decided is stored: a Watcher's process identity lives in the job's own folder, never on the board.
 */

import type { GatePhase }           from './GatePhase.ts';
import type { QuestionOptionNotes } from './OptionConsequences.ts';
import type { EntityKey }           from './Pipeline.ts';

/**
 * `pipeline-agent` reads the repository and proposes its pipeline, or advises on the one it has; it never touches a ticket.
 * `constitution-commit` commits an Apply's `CONSTITUTION.md` and lands it on the main line through the Airlock, with no gate.
 */
export type JobKind =
  | 'build'
  | 'review'
  | 'merge'
  | 'merge-agent'
  | 'refresh'
  | 'constitution-commit'
  | 'assistant'
  | 'product-owner'
  | 'pipeline-agent';

/**
 * A `merge-agent` job runs as its ticket's last worker (`builder`, `reviewer` or `re-reviewer`), resumed into the Airlock, or as a
 * `conflict-re-reviewer`, a fresh session. A review past its first round runs as a `re-reviewer`.
 */
export type JobRole = 'builder' | 'reviewer' | 're-reviewer' | 'conflict-re-reviewer' | 'assistant' | 'product-owner' | 'pipeline-agent';

export type JobState =
  | 'launching'
  | 'preparing'
  | 'running'
  | 'waiting-for-answer'
  | 'interrupted'
  | 'awaiting-answer'
  | 'in-customs'
  | 'gating'
  /**
   * A build or review job whose gates passed, with merge approval on: the Overseer merges the target into the ticket's worktree and gates
   * the merged tree before the ticket waits for User's Merge.
   */
  | 'merging-main'
  | 'merging'
  | 'landing'
  | 'stopping';

/** What the legality table is keyed by: every state a job can be moved into, and `ended`, which takes it off the board. */
export type JobMoveTarget = JobState | 'ended';

export type JobOutcome =
  | 'built'
  | 'reviewed'
  | 'round-granted'
  | 'does-not-hold'
  | 'resolved'
  | 'cannot-resolve'
  | 'landed'
  | 'integrated'
  | 'refreshed'
  /** A constitution commit landed on the main line. */
  | 'committed'
  | 'wound-down'
  /** A stage declared a need on another entity; its branch and commits stay. */
  | 'needs-declared'
  | 'failed'
  | 'blocked'
  | 'replaced'
  | 'stopped'
  | 'closed';

/**
 * `watcher-lost` and `agent-crashed` are the crashes a resume counts; the others never count. `handoff-red` is a handoff whose gate or Customs
 * check went red: the same session is resumed to fix it, counted on its own bound. `forced-stop-refused` is a lost Watcher whose child tree
 * refused the forced stop: the job is never resumed while it holds this cause, and a later pass gives it the cause the next stop settles.
 * `authentication-failed` is a session whose API key was refused: it resumes once User answers the decision that names the failure.
 */
export type InterruptionCause =
  | 'watcher-lost'
  | 'agent-crashed'
  | 'reboot'
  | 'answer-delivery'
  | 'usage-limit'
  | 'handoff-red'
  | 'forced-stop-refused'
  | 'authentication-failed';

/**
 * `re-reviewing`: a conflict re-reviewer judges a resolution that changed more lines than `airlock.reReview.thresholdLines`.
 * `committing`: a constitution commit job writes and commits `CONSTITUTION.md`; its next phase is `landing`, with no gate between.
 */
export type AirlockPhase = 'merge-in' | 'resolving' | 're-reviewing' | 'gating' | 'fixing' | 'committing' | 'landing';

export interface Airlock {
  target:    string;
  targetTip: string;
  branchTip: string;
  phase:     AirlockPhase;
}

/** What User asked of a live job: `stop` and `wind-down` hold its ticket, `fresh` stops it for a fresh agent on the same worktree. */
export type JobStopMode = 'stop' | 'wind-down' | 'fresh';

/** A picture User sent with a message: its id is the sha256 of its bytes in the board's picture store, its name the file's. */
export interface PictureReference {
  pictureId: string;
  name:      string;
}

/**
 * A product-owner job's intake: User's request, the short title the product owner gave it, the draft sets it proposed when it closed intake,
 * and, for a fresh session taking over one replaced past the bound, the answers its predecessor's questions got.
 */
export interface JobIntake {
  text:               string;
  /** Written only once the product owner, or one it took over from, ran `intake title`; a later title replaces it. */
  title?:             string;
  /** The pictures sent with the request, which go with the first message of each session of the intake; written only when there are some. */
  pictures?:          PictureReference[];
  proposedDraftSets?: string[][];
  carriedAnswers?:    Readonly<Record<string, string>>[];
}

/** The last Watcher event the Overseer applied, written in the hold that applied it. */
export interface JobEventCursor {
  instance: number;
  sequence: number;
}

export interface Job {
  /** `J<n>`, from the stored `nextJobId`, never reused or gap-filled. */
  id:                  string;
  kind:                JobKind;
  /** `null` for a merge, refresh or constitution commit job, which runs no agent of its own. */
  role:                JobRole | null;
  ticketIds:           string[];
  /** A merge agent's merge or refresh job; `null` for every other job. */
  parentJobId:         string | null;
  /** From 1; a fresh agent after a failed pass or a `replaced` job is a new job one attempt on. */
  attempt:             number;
  /** The main line or `group-<name>` the job's work goes to; `null` for a session. */
  target:              string | null;
  state:               JobState;
  /** Why the job was last interrupted; absent on a job never interrupted. */
  interruption?:       InterruptionCause;
  /** The newest Watcher instance spawned or to spawn, from 1. */
  watcherInstance:     number;
  eventCursor:         JobEventCursor;
  /** The relayed question request ids already answered, kept until the job ends, so each answer is delivered until its delivery is marked. */
  answeredRequestIds:  string[];
  /** Resumes after a `watcher-lost` or `agent-crashed` interruption only. */
  crashResumes:        number;
  /** On the merge or refresh job holding its target's Airlock, while it holds it. */
  airlock?:            Airlock;
  /** Set once User stopped, wound down or freshened the job; the Overseer sends its frames from it. */
  stopRequest?:        JobStopMode;
  /** On a product-owner job only. */
  intake?:             JobIntake;
  /** Written only while the agent's `question options` notes wait for the question they describe; the decision it opens takes them. */
  pendingOptionNotes?: QuestionOptionNotes[];
  /** Set only on the record `job-ended` hands back: an ended job leaves the board in the same hold. */
  outcome?:            JobOutcome;
  /** Set by the Overseer at launch on a forge with entities: the entity whose stage the job runs. Absent on a forge without entities. */
  entity?:             EntityKey;
  /** The stage of the ticket the job runs, from 1; set with `entity`. */
  stage?:              number;
}

export interface JobLaunch {
  kind:              JobKind;
  role:              JobRole | null;
  ticketIds:         readonly string[];
  parentJobId:       string | null;
  attempt:           number;
  target:            string | null;
  intake?:           JobIntake;
  entity?:           EntityKey;
  stage?:            number;
  /** Only on the launch record, never on the job: the pending tickets a product owner gives an entity after the first Apply over entities. */
  entitiesToAssign?: readonly string[];
}

export interface JobEnding {
  outcome:            JobOutcome;
  /** What ended it, worded by the Overseer; absent when the outcome says it all. */
  cause?:             string;
  /** The commit the job's work ended on, when it made one. */
  commit?:            string;
  deniedPermissions?: readonly string[];
}

export type OverseerStopReason = 'stopped' | 'baton-passed';

/** How a merge reached its target: `landed` fast-forwarded the main line, `integrated` a group branch. */
export type LandingKind = 'landed' | 'integrated';

/** `cannot-run` is a gate that never judged the tree (exit 126 or 127, or a signal), never a failed pass. */
export type GateOutcome = 'passed' | 'failed' | 'cannot-run';

/** What a gate reported of its own tool's cache: every task replayed from it, some, or none. A gate that reports nothing has none. */
export type GateCacheReport = 'hit' | 'partial' | 'miss';

/** One gate of a job's gate run and what it reported of its cache; `null` where it reported nothing readable. */
export interface GateCacheReportOfGate {
  gateName:    string;
  cacheReport: GateCacheReport | null;
}

/** What the gates of one job's gate run reported of their cache, in run order, and the phase the run was in. */
export interface GateRunCacheReports {
  phase: GatePhase;
  gates: readonly GateCacheReportOfGate[];
}
