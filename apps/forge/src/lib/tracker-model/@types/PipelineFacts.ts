/**
 * The pipeline facts Hephaestus serves on its board state for a client's pipeline view: values only, never words, so the view models
 * word every kind, role and label, and a client keeps no copy of the rules that decide which nodes, slots and marks exist.
 */
import type { BoardRefusalDetail } from '../BoardRefusal.ts';
import type { GatePhase }          from './GatePhase.ts';
import type {
  GateCacheReport,
  JobState,
  PipelineStepEnding,
  PipelineStepKind
} from './Job.ts';
import type {
  EntityAgentRole,
  EntityKey,
  InstructionEntry,
  Pipeline,
  PipelineAgentRole
} from './Pipeline.ts';
import type {
  ApplyRequest,
  PipelineDraftField,
  PipelineSetup,
  SourceAnnotation
} from './PipelineSetup.ts';
import type {
  AgentEffort,
  AgentModel,
  AgentPair,
  EntityAssigner
} from './Ticket.ts';

export type PipelineReadingVerdict = 'absent' | 'readable' | 'older' | 'malformed';

/** The newest Apply, from its `pipeline-applied` record. */
export interface PipelineApplication {
  /** 1 for the first Apply, then one more for each. */
  appliedRevision:    number;
  appliedAt:          string;
  appliedBy:          'user';
  /** The constitution commit that Apply landed on main; null when it made none. */
  constitutionCommit: string | null;
}

export type AppliedPipelineFacts =
  | { readingVerdict: 'absent' }
  | { readingVerdict: 'older'; fileText: string }
  | { readingVerdict: 'malformed'; reason: string; fileText: string }
  | {
    readingVerdict: 'readable';
    pipeline:       Pipeline;
    contentHash:    string;
    /** The stored text, for "View pipeline.json". */
    fileText:       string;
    /** Null for a pipeline the `gate` verbs alone wrote. */
    application:    PipelineApplication | null;
  };

/** One ticket the product owner gives an entity after the first Apply over entities; `entity`, `reason` and `assignedBy` are null while it waits. */
export interface EntityAssignmentTicket {
  ticketId:   string;
  /** Null when the board no longer holds the ticket. */
  title:      string | null;
  entity:     EntityKey | null;
  /** The reason of the ticket's newest `entity-assigned` record since the job's launch. */
  reason:     string | null;
  assignedBy: EntityAssigner | null;
}

/** The product owner the first Apply over entities started, from its launch record, and each of its tickets in the record's order. */
export interface EntityAssignmentFacts {
  jobId:    string;
  /** The job's state while it is on the board; null once it ended. */
  jobState: JobState | null;
  tickets:  EntityAssignmentTicket[];
}

/** What A0bResume summarises each step with, as counts. */
export interface PipelineSetupSummary {
  stackItemCount:                number;
  scriptCount:                   number;
  /** Only the research step's answered questions: the research row counts what the research settled. */
  answeredResearchQuestionCount: number;
  prepareStepCount:              number;
  gateCountByPhase:              Record<GatePhase, number>;
  /** The draft edits by User that are not undone. */
  userEditsKeptCount:            number;
}

/** The `##` lines and the top-level `-` items of the constitution's markdown. */
export interface ConstitutionOutline {
  sectionCount: number;
  ruleCount:    number;
}

/** An annotation with the zero-based index of the markdown line it anchors to. */
export interface ResolvedSourceAnnotation extends SourceAnnotation {
  lineIndex: number;
}

/** The pending Apply, with what holds it: the files that block the main checkout and the ticket whose Airlock holds main. */
export interface ApplyStateFacts extends ApplyRequest {
  blockingFiles:       string[];
  ticketIdHoldingMain: string | null;
}

/** What the summary counts of one entity: the entity's own findings, questions and steps; User's edits are counted for the whole draft. */
export type PipelineSetupEntitySummary = Omit<PipelineSetupSummary, 'userEditsKeptCount'>;

/** One entity's part of the setup facts, from its part of the record and its pipeline in the draft, else in the stored pipeline. */
export interface PipelineSetupEntityFacts {
  summary:              PipelineSetupEntitySummary;
  openQuestionCount:    number;
  /** The state of the entity's pipeline-agent job; null when none is on the board. */
  agentJobState:        JobState | null;
  constitutionMarkdown: string | null;
  constitutionOutline:  ConstitutionOutline | null;
  annotations:          ResolvedSourceAnnotation[];
  /** The entity's roles whose instruction lists hold its constitution. */
  readByRoles:          EntityAgentRole[];
}

/** The refusal an Apply of the current draft meets now: the Board's, or main's constitution that git could not read, which an Apply refuses too. */
export type ApplyRefusalFacts =
  | { kind: 'board-refusal'; boardRefusal: BoardRefusalDetail }
  | { kind: 'main-constitution-unreadable'; reason: string };

export interface PipelineSetupFacts {
  record:               PipelineSetup;
  summary:              PipelineSetupSummary;
  openQuestionCount:    number;
  /** Null when no agent job is on the board: it ended, or none started. */
  agentJobState:        JobState | null;
  /** Main's commits since the snapshot; computed on each read, never stored. */
  mainMovedByCommits:   number;
  /** The constitution's Markdown as stored; null with no constitution. */
  constitutionMarkdown: string | null;
  constitutionOutline:  ConstitutionOutline | null;
  annotations:          ResolvedSourceAnnotation[];
  /** The roles whose instruction lists hold the constitution. */
  readByRoles:          PipelineAgentRole[];
  applyState:           ApplyStateFacts | null;
  /** Read against main's texts as this state read them; `null` when an Apply would proceed. */
  applyRefusal:         ApplyRefusalFacts | null;
  /** Absent on a forge without entities: each entity of the draft, else of the stored pipeline, then of the record, by its key. */
  entities?:            Record<EntityKey, PipelineSetupEntityFacts>;
}

export type PipelineNodeKind =
  | 'ticket-creation'
  | 'human-ticket-review'
  | 'builder'
  | 'gates'
  | 'review'
  | 're-review'
  | 'merge-main-into-tree'
  | 'human-code-review'
  | 'ready-for-airlock'
  | 'airlock'
  | 'fast-forward-main';

/** `proposed` while the agent's proposal is not applied; `changed`, `new` and `removed` against the applied pipeline while editing. */
export type PipelineNodeMark = 'unchanged' | 'proposed' | 'changed' | 'new' | 'removed';

/** Where a merge of main into the ticket's tree sits: before review (Q5), before User's code review, or in the merge train. */
export type MergePlacement = 'before-review' | 'before-human-code-review' | 'airlock';

/** Whose model and effort a merge step's derived meter shows: the ticket's last worker, or the builder. */
export type DerivedSettingsSource = 'last-worker' | 'builder';

export type PipelineSwitchState = 'on' | 'off';

/** One row of an agent step's instruction list, resolved to the file it reads. */
export interface ResolvedInstructionEntry {
  entry:       InstructionEntry;
  fileName:    string;
  /** The roles whose lists hold this entry. */
  readByRoles: PipelineAgentRole[];
  /** The file's text read on main, cut at the preview limit; null when the file is not there. */
  text:        string | null;
  textIsCut:   boolean;
}

/**
 * What a double-click or Enter on a node opens: an agent step's dialog, the review or merge step's dialog (a `-re-review` target focuses
 * its re-review section), or the gates area at the node's phase tab. A node with no target opens nothing.
 */
export type PipelineNodeDialogTarget =
  | 'agent-step'
  | 'review-step'
  | 'review-step-re-review'
  | 'merge-step'
  | 'merge-step-re-review'
  | 'gates-tab';

export interface PipelineGateChip {
  gateName: string;
  mark:     PipelineNodeMark;
}

export interface PipelineFlowNode {
  nodeId:             string;
  nodeKind:           PipelineNodeKind;
  role:               PipelineAgentRole | null;
  /** The resolved model and effort of an agent step, or the derived pair of a merge step; null on other nodes. */
  settings:           AgentPair | null;
  instructionEntries: ResolvedInstructionEntry[];
  derivedFrom:        DerivedSettingsSource | null;
  /** Only on a `merge-main-into-tree` node. */
  mergePlacement:     MergePlacement | null;
  /** Only on a `gates` node. */
  phase:              GatePhase | null;
  conditional:        boolean;
  /** Only on a conditional re-review node. */
  thresholdLines:     number | null;
  /** Only on a switch node: Human ticket review and Human code review. */
  switchState:        PipelineSwitchState | null;
  gateChips:          PipelineGateChip[];
  mark:               PipelineNodeMark;
  dialogTarget:       PipelineNodeDialogTarget | null;
  questionIds:        string[];
}

export type PipelineEdgeTone = 'forward' | 'rollback' | 'loop';

/** The label of an edge, worded by the client; `null` draws no label. */
export type PipelineEdgeLabelKind =
  | 'all-green'
  | 'red-builder-fixes'
  | 'conflict-or-red-builder-fixes'
  | 'red-reviewer-fixes'
  | 'red-last-worker-fixes'
  | 'gates-again-after-re-review';

export interface PipelineFlowEdge {
  edgeId:    string;
  from:      string;
  to:        string;
  tone:      PipelineEdgeTone;
  labelKind: PipelineEdgeLabelKind | null;
  /** On the path a ticket takes now; the live flow animates it. */
  active:    boolean;
}

export type PipelineInsertableStep =
  | 'build-gates'
  | 'review'
  | 'human-code-review'
  | 'review-gates'
  | 're-review'
  | 'merge-gates'
  | 'airlock-re-review';

/** A + where a step is missing; the steps that fit on one line share one slot. */
export interface PipelineInsertSlot {
  slotId:       string;
  after:        string;
  offeredSteps: PipelineInsertableStep[];
}

export type PipelineOccupantKind = 'ticket' | 'draft';

/** A ticket, or a filing draft being written, on the node of its current step. */
export interface PipelineOccupant {
  occupantKind: PipelineOccupantKind;
  occupantId:   string;
  nodeId:       string;
  jobId:        string | null;
  since:        string;
}

export type PipelineGateRowKind = 'prepare' | 'gate';

/** One row of a phase's tab in the gates area; prepare rows come first. */
export interface PipelineGateRow {
  rowKind:      PipelineGateRowKind;
  name:         string;
  run:          string;
  fix:          string | null;
  in:           string | null;
  network:      string[];
  /** The other phases the gate runs in; empty for a prepare row. */
  alsoInPhases: GatePhase[];
  mark:         PipelineNodeMark;
}

export type PipelineChangeKind = 'changed' | 'new' | 'removed';

/** One row of the change list between the applied pipeline (or the minimal one) and the draft. */
export interface PipelineChange {
  field:      PipelineDraftField;
  changeKind: PipelineChangeKind;
  /** The newest edit that is not undone on this field; Undo sends it. Null when no edit made the change. */
  editId:     string | null;
}

export type PipelineFlowStage = 'proposal' | 'live' | 'editing';

/** The flow of one entity's pipeline, drawn and marked as the flow of a single pipeline is; its tickets stand on the forge's flow. */
export interface PipelineEntityFlowFacts {
  nodes:       PipelineFlowNode[];
  edges:       PipelineFlowEdge[];
  insertSlots: PipelineInsertSlot[];
  gateRows:    Record<GatePhase, PipelineGateRow[]>;
}

export interface PipelineFlowFacts {
  nodes:             PipelineFlowNode[];
  edges:             PipelineFlowEdge[];
  insertSlots:       PipelineInsertSlot[];
  occupants:         PipelineOccupant[];
  gateRows:          Record<GatePhase, PipelineGateRow[]>;
  changeList:        PipelineChange[];
  ticketIdsInFlight: string[];
  toolbarStage:      PipelineFlowStage;
  /** Absent on a forge without entities: the flow of each entity the drawn pipeline holds, by its key; the flow above is the forge's. */
  entityFlows?:      Record<EntityKey, PipelineEntityFlowFacts>;
}

export type GateProfileRunState = 'queued' | 'running' | 'passed' | 'red' | 'cannot-run' | 'timed-out' | 'stopped';

/** The newest profile run of one gate in one phase, of one entity on a forge over entities; a run starts only on User's press. */
export interface GateProfileRunFacts {
  profileRunId:        string;
  /** Only on a run of an entity's gate. */
  entity?:             EntityKey;
  gateName:            string;
  phase:               GatePhase;
  state:               GateProfileRunState;
  /** Recorded and shown only; null until the run started. */
  elapsedMilliseconds: number | null;
  /** What the gate reported of its cache when the run ended; null while it reported nothing. */
  cacheReport:         GateCacheReport | null;
}

/**
 * What the newest run of a gate in a phase reported of its cache, a job's gate run or a profile run, whichever ended last; a gate whose
 * newest run reported nothing has none. On a forge over entities a gate is an entity's: the mark is kept by entity, gate and phase.
 */
export interface GateCacheMarkFacts {
  /** Only on a mark of an entity's gate. */
  entity?:     EntityKey;
  gateName:    string;
  phase:       GatePhase;
  cacheReport: GateCacheReport;
}

/**
 * The newest run of one step line, kept by entity, step kind, step name and phase, from its `pipeline-step-ran` record: what the pipeline
 * overview shows, so a slow step can be found and made faster.
 */
export interface PipelineStepRunTimeFacts {
  /** Only on a step of an entity's pipeline. */
  entity?:         EntityKey;
  stepKind:        PipelineStepKind;
  stepName:        string;
  /** The gate run's phase; absent for an install step. */
  phase?:          GatePhase;
  /** Recorded and shown only, in the measure of the line's bound. */
  runMilliseconds: number;
  ending:          PipelineStepEnding;
  /** The stamp of the record it comes from. */
  at:              string;
}

/** Every model and effort a step may take, in order; an effort's meter level is its position plus one. */
export interface PipelineChoices {
  models:  AgentModel[];
  efforts: AgentEffort[];
}
