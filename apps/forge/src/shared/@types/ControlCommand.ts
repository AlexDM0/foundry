/**
 * One control a person, a UI or a relayed session can issue, as data: the only shape `src/services/control/ControlService.ts` applies.
 * Every value is plain JSON, so a command survives a Hatch file or an HTTP body unchanged; a body or request file is read before the
 * command is built, which carries its text. A ticket is named as it was written (`3`, `003`, `#3`), resolved inside the hold.
 */
import type { TaskAnnotation, TaskCorrection }     from '../../lib/tracker-model/@types/BoardChanges.ts';
import type { DecisionAnswerForm }                 from '../../lib/tracker-model/@types/Decision.ts';
import type { DraftNoteKind, DraftQuestionAsking } from '../../lib/tracker-model/@types/Draft.ts';
import type { GatePhase }                          from '../../lib/tracker-model/@types/GatePhase.ts';
import type { JobStopMode, PictureReference }      from '../../lib/tracker-model/@types/Job.ts';
import type { OptionNote }                         from '../../lib/tracker-model/@types/OptionConsequences.ts';
import type {
  EntityKey,
  PipelineApproval,
  PipelineBilling,
  PipelineGate,
  PipelineStep
} from '../../lib/tracker-model/@types/Pipeline.ts';
import type {
  ConstitutionSources,
  PipelineDraftEdit,
  PipelineDraftField,
  PipelineSetupStep,
  ResearchFindingRecording,
  SetupQuestionStep,
  SetupQuestionSubject,
  SourceAnnotation
} from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { TaskStatus } from '../../lib/tracker-model/@types/Task.ts';
import type {
  AgentEffort,
  AgentModel,
  TicketPriority,
  TicketSize,
  TicketType
} from '../../lib/tracker-model/@types/Ticket.ts';

export type ListEdit = 'replace' | 'add' | 'remove';

/** One field of the draft pipeline and its new value, as the field names it; a `null` value removes the field or writes its default back. */
export interface PipelineFieldEdit {
  field: PipelineDraftField;
  value: unknown;
}

/** The pipeline agent's edit of one draft field, with its own one-sentence summary that the edit list shows. */
export interface ProposedFieldEdit extends PipelineFieldEdit {
  summary: string;
}

export type WorktreeRepairStep = 'prune' | 'reinstall' | 'recreate' | 'unlock';

/** A chart axis as `range` writes it: each bound a timestamp, `start`, `now` or a signed offset from now, read against the hold's time. */
export type ChartRangeRequest =
  | { kind: 'automatic' }
  | { kind: 'window'; from: string; to: string; tickMinutes: number | null };

/** `tasks-and-log` keeps the tickets, as `clear` does; `everything` also deletes the tickets, the epics and the pictures, as `clear --all`. */
export type TrackerClearScope = 'tasks-and-log' | 'everything';

/**
 * What the Overseer stamps on a ticket its Hatch filed: the filing job, from the Hatch folder's job record, and, on a worker's finding,
 * the tickets of that job (the finders), which the finding waits for.
 */
export interface FilingAdmission {
  filedByJob:       string;
  finderTicketIds?: string[];
}

/**
 * What User's resume of interrupted work names (decision 41): one job, one ticket (its interrupted job and its `interrupted:` hold), every
 * job that waits for an instruction with every `interrupted:` hold, or every job that ended on a network outage (decision 35).
 */
export type ResumeTarget = { jobId: string } | { ticketReference: string } | 'all' | 'network-outage';

export type ControlCommand =
  | {
    kind:          'ticket-add';
    title:         string;
    type:          TicketType;
    priority?:     TicketPriority;
    size?:         TicketSize;
    model?:        AgentModel;
    effort?:       AgentEffort;
    group?:        string;
    dependsOn:     string[];
    epics:         string[];
    network:       string[];
    introducedBy:  string | null;
    foundInReview: string | null;
    /** The key of the entity whose pipeline builds the ticket, in a forge with entities; absent files it with none. */
    entity?:       string;
    /** Null files the ticket template's body. */
    bodyText:      string | null;
    /** Set only by `Bouncer`'s admission of a relayed filing, never by a request: a request carrying it is refused. */
    admission?:    FilingAdmission;
  }
  | {
    kind:              'ticket-edit';
    ticketReference:   string;
    title?:            string;
    /** Null leaves the body as it is. */
    bodyText:          string | null;
    appendsBody:       boolean;
    allowsPastPending: boolean;
  }
  | { kind: 'ticket-depends'; ticketReference: string; edit: ListEdit; ticketIds: string[] }
  | { kind: 'ticket-priority'; ticketReference: string; priority: TicketPriority }
  | { kind: 'ticket-epic'; ticketReference: string; edit: ListEdit; epicKeys: string[] }
  | {
    kind:            'ticket-abandon';
    ticketReference: string;
    reason?:         string;
    branch?:         string;
    commit?:         string;
    tokens?:         number;
  }
  | { kind: 'ticket-ready'; ticketReferences: string[] }
  /** The filer's close of its drafts, judged by the board's ticket review switch. */
  | { kind: 'ticket-submit'; ticketReferences: string[] }
  /** Holds `parked:<kind>` (`parked:user` with no incident) and opens a `parked` decision; `reason` is what User should know. */
  | { kind: 'ticket-park'; ticketReference: string; reason: string; incidentId?: string }
  | { kind: 'incident-answer'; incidentId: string; text: string }
  | { kind: 'incident-note'; incidentId: string; text: string }
  | { kind: 'incident-escalate'; incidentId: string }
  | { kind: 'ticket-network'; ticketReference: string; domains: string[] }
  /**
   * The entity a ticket is built in, with why. Relayed by a product owner without `jobId`: the role policy stamps its own job, and the log
   * names the product owner as the one who assigned it; without one it is User's own command.
   */
  | { kind: 'ticket-entity'; ticketReference: string; entity: string; reason: string; jobId?: string }
  /** Puts a ticket that has no group into one, a started ticket too: its next landing goes to the group's branch. */
  | { kind: 'ticket-group'; ticketReference: string; group: string }
  | { kind: 'ticket-hold'; ticketReference: string; reason: string }
  | { kind: 'ticket-unhold'; ticketReference: string }
  | { kind: 'epic-add'; key: string; title: string; bodyText: string }
  | { kind: 'draft-open'; title: string; request: string; owner: string }
  | { kind: 'draft-claim'; draftId: string; owner: string; forces: boolean }
  | { kind: 'draft-release'; draftId: string }
  | { kind: 'draft-note'; draftId: string; text: string; noteKind: DraftNoteKind }
  | { kind: 'draft-ask'; draftId: string; asking: DraftQuestionAsking }
  | { kind: 'draft-answer'; draftId: string; questionId: string; answer: string }
  | { kind: 'draft-drop'; draftId: string; itemId: string }
  | { kind: 'draft-close'; draftId: string; ticketReferences: string[] }
  | { kind: 'draft-abandon'; draftId: string; reason: string }
  | { kind: 'decision-answer'; decisionId: string; answer: DecisionAnswerForm }
  | { kind: 'overseer-pause' }
  /** Undoes a pause until stage 9 names it `unpause`; resuming interrupted work is `interrupted-work-resume`. */
  | { kind: 'overseer-resume' }
  | { kind: 'interrupted-work-resume'; target: ResumeTarget }
  /** Runtime only: sent to the live Overseer, which stops; the board is never changed by it. */
  | { kind: 'overseer-stop'; now: boolean }
  /** Runtime only: sent to the live Overseer, which hands the board to a successor on the code on disk. */
  | { kind: 'overseer-restart'; now: boolean }
  | { kind: 'job-stop'; jobId: string; mode: Exclude<JobStopMode, 'fresh'> }
  /** `incidentId` names the incident the move handles, in the same hold; the orchestrator must name one. */
  | { kind: 'job-fresh'; jobId: string; incidentId?: string }
  | { kind: 'job-stop-all'; mode: Exclude<JobStopMode, 'fresh'> }
  /**
   * Code-implemented repairs of a ticket's worktree (design section 8.3): `git worktree prune`, the install line rerun by the next launch,
   * the worktree recreated from its branch after its changes are saved, a stale `index.lock` removed. `incidentId` as on `job-fresh`.
   */
  | { kind: 'worktree-repair'; ticketReference: string; step: WorktreeRepairStep; incidentId?: string }
  | { kind: 'gate-retry'; jobId: string; incidentId?: string }
  /** `pictures` name pictures uploaded to `POST /api/pictures` first; only the Bridge sends them, and only to a product owner. */
  | { kind: 'job-message'; jobId: string; text: string; pictures?: PictureReference[]; incidentId?: string }
  /** With pictures the text may be blank. */
  | { kind: 'intake-start'; text: string; pictures?: PictureReference[] }
  /** `entity` names the level the session advises on, an entity of the stored pipeline; absent is the forge. */
  | { kind: 'pipeline-agent-advise'; entity?: EntityKey }
  /** Relayed by a product owner without `jobId`: the role policy stamps its own job, from the Hatch folder. */
  | { kind: 'intake-close'; jobId?: string; proposedDraftSets: string[][] }
  /** The product owner's short title for its intake; relayed without `jobId` like `intake-close`. */
  | { kind: 'intake-title'; jobId?: string; title: string }
  /** An agent's notes for the options of the question it asks next; relayed without `jobId`, the role policy stamps its own job. */
  | { kind: 'question-options'; jobId?: string; question: string; options: OptionNote[] }
  /**
   * A build job's need for another entity: that entity, a title and the body of the ticket it becomes, with a numbered `## Acceptance` that
   * holds the intended use and a `## Brief`. Relayed by the builder without `jobId`: the role policy stamps its own job.
   */
  | { kind: 'need-declare'; jobId?: string; entity: EntityKey; title: string; bodyText: string }
  | { kind: 'concurrency-set'; limit: number }
  /** Machine-wide, never a board change: the Overseer writes `<monitor>/machine-limits.json`; applied to a board it is refused as runtime only. */
  | { kind: 'machine-agent-limit-set'; limit: number }
  | { kind: 'pipeline-prepare-step-set'; step: PipelineStep }
  /** With no `phases`, a new gate runs in every phase and a replaced one keeps its phases. */
  | { kind: 'pipeline-gate-add'; gate: PipelineGate; phases?: GatePhase[] }
  /** `names` is the whole new run order of the gates `phase` already runs. */
  | { kind: 'pipeline-gate-order'; phase: GatePhase; names: string[] }
  | { kind: 'pipeline-gates-none' }
  | { kind: 'pipeline-gate-remove'; name: string }
  | { kind: 'pipeline-approval-set'; approval: PipelineApproval; on: boolean }
  /** The whole reach, each a repository path leading with `/`; an empty list clears it. */
  | { kind: 'pipeline-reach-set'; paths: string[] }
  /** User's first setup of the pipeline: it opens the setup record; `replacesUnreadablePipeline` lets Apply write over an unreadable file. */
  | { kind: 'pipeline-setup-start'; billing: PipelineBilling; replacesUnreadablePipeline: boolean }
  | { kind: 'pipeline-setup-billing'; setupId: string; billing: PipelineBilling }
  | { kind: 'pipeline-setup-step'; setupId: string; step: PipelineSetupStep; move: 'continue' }
  | { kind: 'pipeline-setup-start-over'; setupId: string }
  /** Opens the record's pipeline agent again; when main moved, its snapshot moves to main's tip first. */
  | { kind: 'pipeline-setup-resume'; setupId: string }
  | { kind: 'pipeline-setup-answer'; setupId: string; questionId: string; answer: DecisionAnswerForm }
  /** `markdown` is the whole document; `draftedFrom` the SOURCES ticks; `revision` the constitution revision User saw. */
  | {
    kind:         'pipeline-constitution-edit';
    setupId:      string;
    revision:     number;
    markdown?:    string;
    draftedFrom?: ConstitutionSources;
    /** The entity whose constitution it edits; absent is the forge's. */
    entity?:      EntityKey;
  }
  /** Opens an update record on the stored pipeline; `entity` names the level it opens at, an entity of that pipeline; absent is the forge. */
  | { kind: 'pipeline-update-start'; entity?: EntityKey }
  /**
   * Typed edits, each addressed by its target. `isACopy`: the edits copy one entity's settings to others, and the set is stored under one
   * `batch` that can be undone at once.
   */
  | { kind: 'pipeline-draft-edit'; setupId: string; draftRevision: number; edits: readonly PipelineDraftEdit[]; isACopy?: true }
  /** `wholeBatch`: every edit of the copy that `editId` belongs to, at `editId`'s level, that still stands is undone at once, as one set. */
  | { kind: 'pipeline-draft-undo'; setupId: string; editId: string; wholeBatch?: true }
  | { kind: 'pipeline-draft-discard'; setupId: string }
  /**
   * User's press: one gate in one phase, from the open setup's draft, or with `setupId` `null` from the stored pipeline; on a forge over
   * entities, the gate of the `entity` named.
   */
  | { kind: 'gate-profile-start'; setupId: string | null; gateName: string; phase: GatePhase; entity?: EntityKey }
  | { kind: 'gate-profile-stop'; profileRunId: string }
  /** Stage 1 of an Apply of the draft at `draftRevision`; `resumesBoard` resumes a paused board once the pipeline is stored. */
  | { kind: 'pipeline-apply'; setupId: string; draftRevision: number; resumesBoard: boolean }
  | { kind: 'pipeline-apply-cancel'; setupId: string }
  /** User's press: the Overseer runs the gates the draft changes or adds twice, in a fresh worktree of main, and tells the agent. */
  | { kind: 'pipeline-check'; setupId: string }
  /**
   * The pipeline agent's moves on the setup record it serves. Relayed without `jobId`, `setupId` or `entity`: the role policy stamps its
   * own job, that job's setup and, for the session of one entity, that entity, from the Hatch folder and the record.
   */
  | ({ kind: 'pipeline-finding-record'; jobId?: string; setupId?: string; entity?: EntityKey } & ResearchFindingRecording)
  /** `options` are the option texts in letter order, `a` first; `recommended` their letters. */
  | {
    kind:        'pipeline-question-ask';
    jobId?:      string;
    setupId?:    string;
    entity?:     EntityKey;
    step:        SetupQuestionStep;
    subject:     SetupQuestionSubject | null;
    question:    string;
    context:     string;
    options:     string[];
    recommended: string[];
    multiple:    boolean;
  }
  /** The whole document each time, never a section; `sources` name the lines a source stands behind. */
  | {
    kind: 'pipeline-constitution-draft'; jobId?: string; setupId?: string; entity?: EntityKey; markdown: string; sources: SourceAnnotation[]
  }
  | { kind: 'pipeline-draft-propose'; jobId?: string; setupId?: string; entity?: EntityKey; edits: ProposedFieldEdit[] }
  /** The agent's suggestion that User may continue the step; it never moves a step. */
  | { kind: 'pipeline-step-ready'; jobId?: string; setupId?: string; entity?: EntityKey; step: SetupQuestionStep }
  /** With merge approval on: User's accept of a ticket waiting for merge, refused unless git predicts a clean merge into its target. */
  | { kind: 'merge-accept'; ticketReference: string }
  /** With merge approval on: the target merged into the ticket's worktree in the hold, with no Airlock; a conflict is aborted. */
  | { kind: 'merge-update'; ticketReference: string }
  /** The board's default chart axis, as `range` stores it. Only User's own surfaces send it: it is never relayed from a job. */
  | { kind: 'chart-range-set'; range: ChartRangeRequest }
  /** `clear`, refused while a job other than the Assistant is live. Only User's own surfaces send it: it is never relayed from a job. */
  | { kind: 'tracker-clear'; scope: TrackerClearScope }
  /**
   * Records a ticket User finished and landed outside the Overseer, refused while a job of the ticket is live. The verb is refused while an
   * Overseer is live; the live Overseer applies this command in its own hold. Never relayed from a job.
   */
  | { kind: 'ticket-deliver-by-hand'; ticketReference: string; branch?: string; commit?: string }
  /** The by-hand kinds below are User's own verbs outside a job: never relayed from a job, never accepted by `POST /api/commands`. */
  | {
    kind:               'task-add';
    name:               string;
    ticketReference?:   string;
    reviewOfReference?: string;
    owner?:             string;
    note?:              string;
    tokens?:            number;
    startsNow:          boolean;
    movesTheLink:       boolean;
  }
  | { kind: 'task-move'; taskId: number; status: Exclude<TaskStatus, 'abandoned'>; movesAnyway: boolean; annotation: TaskAnnotation }
  | { kind: 'task-correct'; taskId: number; correction: TaskCorrection; movesAnyway: boolean; annotation: TaskAnnotation }
  | { kind: 'task-remove'; taskId: number }
  | { kind: 'log-note'; text: string }
  | { kind: 'namespace-set'; namespace: string };

export type ControlCommandKind = ControlCommand['kind'];

export type ControlCommandOf<Kind extends ControlCommandKind> = Extract<ControlCommand, { kind: Kind }>;

/**
 * Flint's brain, started and stopped through `POST /api/commands` alone: it runs in the live Overseer's memory, so no board applies it, no
 * verb names it and no job relays it.
 */
export type FlintBrainCommand = { kind: 'flint-brain-start' } | { kind: 'flint-brain-stop' };

/** What `POST /api/commands` takes: every control command, and Flint's brain's. */
export type OverseerApiCommand = ControlCommand | FlintBrainCommand;

export type OverseerApiCommandOf<Kind extends OverseerApiCommand['kind']> = Extract<OverseerApiCommand, { kind: Kind }>;
