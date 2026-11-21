/**
 * The setup record, `<data>/pipeline-setup.json`: one open setup, update or advise session of the pipeline agent, saved as each answer,
 * edit and finding happens so every step can resume. Only an Apply writes `pipeline.json` from it.
 */
import type { DraftAnswer, DraftQuestionOption } from './Draft.ts';
import type { GatePhase }                        from './GatePhase.ts';
import type { GateOutcome }                      from './Job.ts';
import type {
  AgentStepSettings,
  EntityAgentRole,
  EntityKey,
  Pipeline,
  PipelineAgentRole,
  PipelineAirlock,
  PipelineApproval,
  PipelineBilling,
  PipelineConstitution,
  PipelineEntity,
  PipelineGate,
  PipelineReview,
  PipelineStep
} from './Pipeline.ts';

/** `entities` is walked only by a record whose step states hold it: a forge over entities. */
export type PipelineSetupStep = 'billing' | 'research' | 'entities' | 'constitution' | 'design' | 'apply';

/** A later `done` step becomes `needs-recheck` when an earlier one reopens, never `not-started`. */
export type PipelineSetupStepState = 'not-started' | 'in-progress' | 'done' | 'needs-recheck';

/** Every step but `entities` always has a state; `entities` has one only once the record walks it, written only once set. */
export type PipelineSetupStepStates =
  & Record<Exclude<PipelineSetupStep, 'entities'>, PipelineSetupStepState>
  & { entities?: PipelineSetupStepState };

/** `setup` designs the first pipeline; `update` changes an applied one; `advise` is an update the pipeline agent starts on. */
export type PipelineSetupMode = 'setup' | 'update' | 'advise';

/** `layout` reports the repository's stand-alone codebases, from which the `entities` step proposes entities. */
export type ResearchFindingTopic = 'stack' | 'scripts' | 'conventions' | 'continuous-integration' | 'note' | 'layout';

export type GateCandidacy = 'gate' | 'not-a-gate' | 'unsure';

/** A script the research recorded; it is never run during the research. */
export interface ResearchScript {
  name:          string;
  run:           string;
  meaning:       string;
  gateCandidate: GateCandidacy;
  /** What the script needs besides the tree, such as a network or a service. */
  needs:         string[];
}

/** `F1`, `F2`, …: one thing the pipeline agent found in the repository. */
export interface ResearchFinding {
  findingId:    string;
  topic:        ResearchFindingTopic;
  label:        string;
  value:        string | null;
  sourcePaths:  string[];
  script:       ResearchScript | null;
  needsRecheck: boolean;
}

/** The steps the pipeline agent works on, where it asks and suggests a Continue. */
export type SetupQuestionStep = Extract<PipelineSetupStep, 'research' | 'entities' | 'constitution' | 'design'>;

export type SetupQuestionSubjectKind = 'node' | 'gate' | 'rule' | 'finding';

/** What a question blocks: only that node, gate, rule or finding waits for its answer. */
export interface SetupQuestionSubject {
  kind:      SetupQuestionSubjectKind;
  reference: string;
}

/** `Q1`, `Q2`, …: a draft question's shape plus its step and subject. */
export interface SetupQuestion {
  questionId:  string;
  step:        SetupQuestionStep;
  subject:     SetupQuestionSubject | null;
  question:    string;
  context:     string;
  options:     DraftQuestionOption[];
  recommended: string[];
  multiple:    boolean;
  /** Null while the question is open. */
  answer:      DraftAnswer | null;
}

export type SourceAnnotationKind = 'contributing' | 'research' | 'installed-default';

/** A source the agent named for one line: anchored to that line's exact text and its occurrence among equal lines. */
export interface SourceAnnotation {
  /** One whole line of the markdown, without its line ending. */
  lineText:   string;
  /** 1 for the first line with that text, 2 for the second, and so on. */
  occurrence: number;
  kind:       SourceAnnotationKind;
  /** The repository-relative source path, such as `CONTRIBUTING.md`; null when the source has no file. */
  path:       string | null;
}

/** What User asked the agent to draft the constitution from: the SOURCES ticks, which steer the next draft and are not the tags. */
export interface ConstitutionSources {
  contributing:     boolean;
  research:         boolean;
  installedDefault: boolean;
}

/** A free markdown document, stored and committed byte for byte; its sources live beside it and never in the text. */
export interface ConstitutionDraft {
  markdown:    string;
  annotations: SourceAnnotation[];
  draftedFrom: ConstitutionSources;
  /**
   * Main's blob of `CONSTITUTION.md` when the record opened; null when main had no such file. An entity's draft takes main's blob of its
   * file at each Apply request, which its commit must find.
   */
  baseBlob:    string | null;
  revision:    number;
}

/** A field of what a pipeline and an entity both hold: a gate, a phase's order, a prepare step, the prepare order, the review, the constitution. */
export type PipelineStepsDraftField =
  | `gate:${string}`
  | `phase-order:${GatePhase}`
  | `prepare:${string}`
  | 'prepare-order'
  | 'review'
  | 'constitution';

/** A field inside one entity: its steps, its own roles, the packages it may cross into, its reach, its dependencies and its job cap. */
export type EntityDraftField =
  | PipelineStepsDraftField
  | `role:${EntityAgentRole}`
  | 'whitelist'
  | 'reach'
  | 'depends-on'
  | 'concurrency';

/**
 * An addressable part of the draft pipeline: an edit names one, and a `null` value on a gate, prepare step, review or airlock removes it.
 * `entity:<key>` is an entity's definition, and `entity:<key>/<field>` a field inside that entity; every other field keeps its name.
 */
export type PipelineDraftField =
  | PipelineStepsDraftField
  | `role:${PipelineAgentRole}`
  | 'airlock'
  | `approval:${PipelineApproval}`
  | `entity:${EntityKey}`
  | `entity:${EntityKey}/${EntityDraftField}`;

export type SetupEditAuthor = 'agent' | 'user';

/** `E1`, `E2`, …: who changed which field, for attribution and Undo; the summary is the author's own sentence. */
export interface SetupEdit {
  editId:  string;
  by:      SetupEditAuthor;
  field:   PipelineDraftField;
  summary: string;
  undone:  boolean;
  /** The first edit id of the set one copy to another entity made, so the set can be undone at once; written only by a copy. */
  batch?:  string;
}

export type ApplyRequestState = 'committing' | 'held' | 'refused';

/** E91 and E94, which stage 2 gives again when a ticket started or took an entity while the request waited. */
export type EntityChangeRefusalReason = 'entity-named-by-tickets' | 'entities-while-tickets-in-flight';

/**
 * Why the constitution commit holds or was refused: stored codes, worded only for display. `pipeline-moved`: the stored pipeline changed
 * by hand while the commit waited, so the commit does not land. `interrupted`: a start that waits found the commit cut short, so it holds
 * until User's `resume --all`.
 */
export type ApplyRequestReason =
  | 'interrupted'
  | 'not-on-target-branch'
  | 'dirty-checkout'
  | 'target-file-held'
  | 'git-failed'
  | 'constitution-commit-unsigned'
  | 'constitution-commit-unexpected-paths'
  | 'constitution-moved'
  | 'pipeline-moved'
  | EntityChangeRefusalReason;

/** Why the main line holds the constitution commit: the reason and the files of the main checkout that stop the fast-forward. */
export interface ApplyHolding {
  reason:        ApplyRequestReason;
  blockingFiles: readonly string[];
}

/** Why the constitution commit was refused: the reason and, when git refused, git's own text. */
export interface ApplyRefusal {
  reason:     ApplyRequestReason;
  gitFailure: string | null;
}

/** Stage 1 of an Apply, waiting for the Airlock's commit of `CONSTITUTION.md` before the pipeline is stored. */
export interface ApplyRequest {
  draftRevision: number;
  resumesBoard:  boolean;
  /** The Airlock's constitution commit job; null when no job holds the commit yet. */
  commitJobId:   string | null;
  state:         ApplyRequestState;
  /** Null while committing. */
  reason:        ApplyRequestReason | null;
}

/** A check User asked for: waiting for a slot, running, judged, unable to judge anything, or ended by a Hephaestus stop with no result. */
export type PipelineCheckState = 'queued' | 'running' | 'checked' | 'cannot-run' | 'stopped';

/** What a touched gate did in the two runs: `disagreeing` when the two runs differ. */
export type CheckedGateVerdict = 'green' | 'red' | 'cannot-run' | 'disagreeing';

export interface CheckedGate {
  name:                  string;
  outcomes:              GateOutcome[];
  /** Recorded and shown only, never deciding a verdict. */
  durationsMilliseconds: number[];
  verdict:               CheckedGateVerdict;
  /** The end of the last red or unrunnable run's output; empty when both runs passed. */
  output:                string;
}

/** The two runs of the draft's prepare steps and its touched gates in a fresh worktree of main. */
export interface PipelineCheckResult {
  /** The main commit the worktree held. */
  snapshotCommit: string;
  /** The first prepare step that did not exit 0 in each run, `null` where every one did; and the end of its output. */
  prepare:        { failedSteps: (string | null)[]; output: string };
  gates:          CheckedGate[];
}

/** User's check of the gates the draft touches: only those gates run, twice, and the result goes to the pipeline agent. */
export interface PipelineCheck {
  /** The draft revision whose gates the check runs: the request's, then the one the run started on. */
  draftRevision: number;
  /** The gates the draft changes or adds against the base pipeline, in draft order. */
  gateNames:     string[];
  state:         PipelineCheckState;
  /** Set only once `checked`. */
  result:        PipelineCheckResult | null;
  /** Why a `cannot-run` check judged nothing: a stored code or the refusal's own text; null in every other state. */
  reason:        string | null;
}

/** How a check run ended: judged with its result, or unable to judge anything, with the reason. */
export type PipelineCheckEnding =
  | { state: 'checked'; result: PipelineCheckResult }
  | { state: 'cannot-run'; reason: string };

/** What a check runs, read from the draft in the hold that marks it running. */
export interface PipelineCheckStart {
  draftRevision: number;
  prepare:       PipelineStep[];
  gates:         PipelineGate[];
  /** An entity's check only: the entity's first home, under which its steps' and gates' folders are read. */
  entityHome?:   string;
}

export interface SetupNextNumbers {
  finding:  number;
  question: number;
  edit:     number;
}

/** One entity's part of the record: its pipeline-agent session, findings, questions, constitution draft and newest check. */
export interface PipelineSetupEntity {
  agentJobId:   string | null;
  findings:     ResearchFinding[];
  questions:    SetupQuestion[];
  constitution: ConstitutionDraft | null;
  /** Absent until User first asks for a check of this entity; written only once set. */
  check?:       PipelineCheck;
}

export interface PipelineSetup {
  formatVersion:              2;
  /** `S1`, `S2`, …: never reused. */
  setupId:                    string;
  mode:                       PipelineSetupMode;
  /** The stored pipeline's content hash when an update or advise record opened; null for a first setup. */
  baseContentHash:            string | null;
  stepStates:                 PipelineSetupStepStates;
  currentStep:                PipelineSetupStep;
  billing:                    PipelineBilling;
  agentJobId:                 string | null;
  /** The main commit the agent's snapshot holds; how far main moved since is computed, never stored. */
  snapshotCommit:             string | null;
  /** The agent's suggestion to continue; it never moves a step. */
  readyToContinue:            PipelineSetupStep[];
  findings:                   ResearchFinding[];
  questions:                  SetupQuestion[];
  constitution:               ConstitutionDraft | null;
  /** The full pipeline being designed. */
  draft:                      Pipeline | null;
  draftRevision:              number;
  edits:                      SetupEdit[];
  replacesUnreadablePipeline: boolean;
  applyRequest:               ApplyRequest | null;
  /** Absent until User first asks for a check; then the newest check, written only once set. */
  check?:                     PipelineCheck;
  /** Absent on a forge without entities; each entity's part by its key, written only once set. The draft holds every entity. */
  entities?:                  Record<EntityKey, PipelineSetupEntity>;
  /** An update or advise opened at an entity: that entity's key, the level whose session a resume opens. Absent at the forge. */
  openedAtEntity?:            EntityKey;
  nextNumbers:                SetupNextNumbers;
  /** Keys this build does not know, kept in order so a round trip stays byte-identical. */
  extra:                      Array<[string, unknown]>;
}

/** What a turn end's Customs refused in the pipeline agent's snapshot: the check and its reason, as stored values. */
export interface SnapshotRefusal {
  check:  string;
  reason: string;
}

/** `pipeline-setup.json` as read: no open record, the record, or a file the board cannot use, which nothing writes over. */
export type PipelineSetupReading =
  | { verdict: 'absent' }
  | { verdict: 'readable'; setup: PipelineSetup }
  | { verdict: 'malformed'; reason: string };

/** Main's `CONSTITUTION.md`: its repository path, its text byte for byte and its blob id. */
export interface MainConstitution {
  path:     string;
  markdown: string;
  blob:     string;
}

/** Main's `CONSTITUTION.md` as git answers for it: no such file, its text and blob, or a read git could not answer. */
export type MainConstitutionReading =
  | { verdict: 'absent' }
  | { verdict: 'read'; constitution: MainConstitution }
  | { verdict: 'unreadable'; reason: string };

/** Each entity's constitution file on main as the caller read it, by entity key; null where main holds no such file. */
export type EntityConstitutionsOnMain = Readonly<Record<EntityKey, MainConstitution | null>>;

/** What main holds when an Apply reads it: the forge's `CONSTITUTION.md` and, on a draft over entities, each entity's file. */
export interface ApplyMainReading {
  /** Null when main holds no `CONSTITUTION.md`. */
  mainConstitution:           MainConstitution | null;
  /** Absent on a draft without entities; on a draft over entities, the file at each entity's constitution path. */
  entityConstitutions?:       EntityConstitutionsOnMain;
  /**
   * The words of the request that the product owner gets after the first Apply over entities, for the committed tickets without an
   * entity; absent, no product owner starts.
   */
  entityAssignmentRequestOf?: (ticketIds: readonly string[]) => string;
}

/** Stage 1 of an Apply: the draft revision User saw, whether the board resumes, and main as the caller read it. */
export interface ApplyRequesting extends ApplyMainReading {
  draftRevision: number;
  resumesBoard:  boolean;
}

/** Stage 2 of an Apply: what main holds once the constitutions are there, and the commit that put them there, null when none was made. */
export interface ApplyFinishing extends ApplyMainReading {
  draftRevision:      number;
  resumesBoard:       boolean;
  constitutionCommit: string | null;
}

/** `<data>/constitution-sources.json`: the agent's sources of the constitution main holds, valid only for the text whose blob id is `blob`. */
export interface StoredConstitutionSources {
  formatVersion: 1;
  blob:          string;
  annotations:   SourceAnnotation[];
  /** Keys this build does not know, kept in order so a round trip stays byte-identical. */
  extra:         Array<[string, unknown]>;
}

/** `constitution-sources.json` as read: none stored, the sources, or a file that shows no tags and that only an Apply writes over. */
export type ConstitutionSourcesReading =
  | { verdict: 'absent' }
  | { verdict: 'readable'; sources: StoredConstitutionSources }
  | { verdict: 'malformed'; reason: string };

/** What opens a record; the caller read main and the stored annotations, so the Board does no I/O. */
export interface PipelineSetupOpening {
  mode:                       PipelineSetupMode;
  billing:                    PipelineBilling;
  replacesUnreadablePipeline: boolean;
  /** Null when main holds no `CONSTITUTION.md`. */
  mainConstitution:           MainConstitution | null;
  /** The stored annotations of main's text, only when their blob id is main's; else empty. */
  storedAnnotations:          readonly SourceAnnotation[];
}

/** An edit of what a pipeline and an entity both hold; a `null` value removes what the field names. */
export type PipelineStepsDraftEdit =
  | { target: 'gate'; name: string; value: PipelineGate | null }
  | { target: 'phase-order'; phase: GatePhase; names: string[] }
  | { target: 'prepare'; name: string; value: PipelineStep | null }
  | { target: 'prepare-order'; names: string[] }
  | { target: 'review'; value: PipelineReview | null }
  | { target: 'constitution'; value: PipelineConstitution | null };

/** An edit inside one entity; a `null` value removes the key, so a list is absent and the cap is the board's limit alone. */
export type EntityDraftEdit =
  | PipelineStepsDraftEdit
  | { target: 'role'; role: EntityAgentRole; value: AgentStepSettings | null }
  | { target: 'whitelist'; value: EntityKey[] | null }
  | { target: 'reach'; value: string[] | null }
  | { target: 'depends-on'; value: EntityKey[] | null }
  | { target: 'concurrency'; value: number | null };

/** What an entity's definition field sets: its kind, home folders and summary. Its pipeline is edited field by field inside it. */
export type PipelineEntityDefinition = Pick<PipelineEntity, 'kind' | 'home' | 'summary'>;

/** One edit of the draft, addressed as its field names it; a `null` value removes what the field names, or writes its default back. */
export type PipelineDraftEdit =
  | PipelineStepsDraftEdit
  | { target: 'role'; role: PipelineAgentRole; value: AgentStepSettings | null }
  | { target: 'airlock'; value: PipelineAirlock | null }
  | { target: 'approval'; approval: PipelineApproval; value: boolean | null }
  | { target: 'entity'; entityKey: EntityKey; value: PipelineEntityDefinition | null }
  | { target: 'within-entity'; entityKey: EntityKey; edit: EntityDraftEdit };

/** One edit with its author's own sentence, which the edit list and the Changes tab show. */
export interface SummarisedDraftEdit {
  edit:    PipelineDraftEdit;
  summary: string;
}

/** `revision` is the draft revision the author saw; null for the agent, whose edits never race a form. */
export interface DraftEditRequest {
  by:       SetupEditAuthor;
  revision: number | null;
  edits:    readonly SummarisedDraftEdit[];
  /** Present: the edits copy one entity's settings to another, and each stored edit gets the set's `batch`. */
  isACopy?: true;
}

export type ResearchFindingRecording = Omit<ResearchFinding, 'findingId' | 'needsRecheck'>;

export interface SetupQuestionAsking {
  step:               SetupQuestionStep;
  subject:            SetupQuestionSubject | null;
  question:           string;
  context:            string;
  optionTexts:        readonly string[];
  recommendedLetters: readonly string[];
  multiple:           boolean;
}

/** The chosen option letters, or free text. */
export type SetupQuestionReply = { letters: readonly string[] } | { text: string };

/** The agent's whole document and its sources, sent whole each time. */
export interface ConstitutionSetting {
  markdown:    string;
  annotations: readonly SourceAnnotation[];
}

/** User's edit: the revision User saw, and the whole markdown, the SOURCES ticks, or both. */
export interface ConstitutionEdit {
  revision:     number;
  markdown?:    string;
  draftedFrom?: ConstitutionSources;
}
