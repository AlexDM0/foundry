/**
 * A unit of Hephaestus's agent work, stored in progress.json while it is unsettled so a restart reads every job from disk. Only what
 * Hephaestus decided is stored: a child's process identity lives in the job's own folder, never on the board.
 */

import type { GatePhase }           from './GatePhase.ts';
import type { QuestionOptionNotes } from './OptionConsequences.ts';
import type { EntityKey }           from './Pipeline.ts';

/**
 * `pipeline-agent` proposes or advises on the pipeline and never touches a ticket; `constitution-commit` lands an Apply's `CONSTITUTION.md`
 * through the Airlock with no gate; `document-agent` writes one ticket document in a read-only snapshot of the main line; `effect-reading`
 * reads what a document version names in the main line's tree, outside the agent slots.
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
  | 'pipeline-agent'
  | 'document-agent'
  | 'effect-reading';

/**
 * A `merge-agent` job runs as its ticket's last worker (`builder`, `reviewer` or `re-reviewer`), resumed into the Airlock, or as a
 * `conflict-re-reviewer`, a fresh session. A review past its first round runs as a `re-reviewer`.
 */
export type JobRole =
  | 'builder'
  | 'reviewer'
  | 're-reviewer'
  | 'conflict-re-reviewer'
  | 'assistant'
  | 'product-owner'
  | 'pipeline-agent'
  | 'spec-agent'
  | 'plan-agent'
  | 'effect-reader';

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
   * A build or review job whose gates passed, with merge approval on: Hephaestus merges the target into the ticket's worktree and gates
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
  /** A package build refused the package change its constitution forbids; its reason is in the `package-refused` decision. */
  | 'refused'
  /** An adapt build sent the ticket back to a sealed package's build; its reason goes to that build. */
  | 'package-return'
  | 'failed'
  | 'blocked'
  | 'replaced'
  | 'stopped'
  | 'closed';

/**
 * Only `talos-lost` and `agent-crashed` count against a job's crash resumes; `RESUME_POLICY_OF_CAUSE` names how each cause resumes.
 * `handoff-red` resumes the same session to fix a red gate or Customs check, counted on its own bound.
 */
export type InterruptionCause =
  | 'talos-lost'
  | 'agent-crashed'
  | 'reboot'
  | 'answer-delivery'
  | 'usage-limit'
  | 'handoff-red'
  | 'forced-stop-refused'   // the lost child's process tree refused the forced stop; a later pass gives the cause the next stop settles
  | 'authentication-failed'
  | 'talos-paused'          // a clean quit of Talos
  | 'lease-ended'           // Talos stopped the agents of a Hephaestus that lost its lease
  | 'network-outage'        // the agent ended on an outage its own retries did not outlast
  | 'forge-stopped'         // the child ended with a deliberate stop of the forge
  | 'forge-crashed';        // the child went with a crash of Hephaestus or Talos

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

/**
 * Why a job's session did not launch, nothing spawned: the forge names no agent, an agent of another vendor than this forge's program
 * runs, its machine's program of the vendor is not set, its billing names a way its vendor does not bill, or the program the choice names
 * cannot run where it lies.
 */
export type JobNotLaunchedCause =
  | 'no-agent-chosen'
  | 'other-vendor'
  | 'no-machine-program'
  | 'billing-not-offered'
  | 'relative-path'
  | 'inside-forbidden-root'
  | 'batch-target'
  | 'not-there'
  | 'not-executable'
  | 'no-adapter';

/** A launch refused for its agent's program: no pass tries it again until the program the forge names differs, or User looks again. */
export interface JobNotLaunched {
  cause:       JobNotLaunchedCause;
  /** The program the forge named when the launch was refused; `null` when it named none. */
  programPath: string | null;
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

/** The last child event Hephaestus applied, written in the hold that applied it. */
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
  /** The newest child instance spawned or to spawn, from 1. */
  childInstance:       number;
  eventCursor:         JobEventCursor;
  /** The relayed question request ids already answered, kept until the job ends, so each answer is delivered until its delivery is marked. */
  answeredRequestIds:  string[];
  /** Resumes after a `talos-lost` or `agent-crashed` interruption only. */
  crashResumes:        number;
  /** On the merge or refresh job holding its target's Airlock, while it holds it. */
  airlock?:            Airlock;
  /** Set once User stopped, wound down or freshened the job; Hephaestus sends its frames from it. */
  stopRequest?:        JobStopMode;
  /** On a product-owner job only. */
  intake?:             JobIntake;
  /** Written only while the agent's `question options` notes wait for the question they describe; the decision it opens takes them. */
  pendingOptionNotes?: QuestionOptionNotes[];
  /** Set only on the record `job-ended` hands back: an ended job leaves the board in the same hold. */
  outcome?:            JobOutcome;
  /** Set by Hephaestus at launch on a forge with entities: the entity whose stage the job runs. Absent on a forge without entities. */
  entity?:             EntityKey;
  /** The stage of the ticket the job runs, from 1; set with `entity`. */
  stage?:              number;
  /** Written only while the job's launch stands refused for its agent's program; the job keeps its state and no pass launches it. */
  notLaunched?:        JobNotLaunched;
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
  /** Only on the launch record, never on the job: the committed tickets a product owner gives an entity after the first Apply over entities. */
  entitiesToAssign?: readonly string[];
}

export interface JobEnding {
  outcome:            JobOutcome;
  /** What ended it, worded by Hephaestus; absent when the outcome says it all. */
  cause?:             string;
  /** The commit the job's work ended on, when it made one. */
  commit?:            string;
  deniedPermissions?: readonly string[];
}

export type HephaestusStopReason = 'stopped' | 'handed-over';

/** What the forge's start found before it: no earlier start, a restart, a stop on purpose, a machine that went down, or a crash. */
export type StartKind = 'first-start' | 'handover' | 'stopped-on-purpose' | 'machine-went-down' | 'crashed';

/** Who started the forge: User, or a predecessor handing the Hephaestus lock over. */
export type StartOrigin = 'user' | 'successor';

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

/** Which kind of pipeline step a line ran: a prepare step, a job's install included, or a gate. */
export type PipelineStepKind = 'prepare' | 'gate';

/** The kind of a job's line a crash or a reboot cut short: an install step or a step of a gate run, its prepare steps included. */
export type LostLineKind = 'gate' | 'install';

/** How a step line that ran ended: `time-bound` when Talos stopped it at its bound, else as its run was judged. */
export type PipelineStepEnding = 'passed' | 'failed' | 'time-bound';

/** One step line that ran, with its run time in the measure of its bound, a sleep not counted: recorded and shown only. */
export interface PipelineStepRun {
  stepKind:        PipelineStepKind;
  stepName:        string;
  /** Only on a step of an entity's pipeline. */
  entity?:         EntityKey;
  runMilliseconds: number;
  ending:          PipelineStepEnding;
}

/** The step lines one gate run ran, in run order, and the phase the run was in. */
export interface GateRunStepRuns {
  phase: GatePhase;
  steps: readonly PipelineStepRun[];
}
