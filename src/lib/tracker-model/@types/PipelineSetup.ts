/**
 * The setup record, `<data>/pipeline-setup.json`: one open setup, update or advise session of the pipeline agent, saved as each answer,
 * edit and finding happens so every step can resume. Only an Apply writes `pipeline.json` from it.
 */
import type { DraftAnswer, DraftQuestionOption } from './Draft.ts';
import type { GatePhase }                        from './GatePhase.ts';
import type {
  AgentStepSettings,
  Pipeline,
  PipelineAgentRole,
  PipelineAirlock,
  PipelineApproval,
  PipelineBilling,
  PipelineConstitution,
  PipelineGate,
  PipelineReview,
  PipelineStep
} from './Pipeline.ts';

export type PipelineSetupStep = 'billing' | 'research' | 'constitution' | 'design' | 'apply';

/** A later `done` step becomes `needs-recheck` when an earlier one reopens, never `not-started`. */
export type PipelineSetupStepState = 'not-started' | 'in-progress' | 'done' | 'needs-recheck';

/** `setup` designs the first pipeline; `update` changes an applied one; `advise` is an update the pipeline agent starts on. */
export type PipelineSetupMode = 'setup' | 'update' | 'advise';

export type ResearchFindingTopic = 'stack' | 'scripts' | 'conventions' | 'continuous-integration' | 'note';

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

export type SetupQuestionStep = Extract<PipelineSetupStep, 'research' | 'constitution' | 'design'>;

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
  /** Main's blob of `CONSTITUTION.md` when the record opened; null when main had no such file. */
  baseBlob:    string | null;
  revision:    number;
}

/** An addressable part of the draft pipeline: an edit names one, and a `null` value on a gate, prepare step, review or airlock removes it. */
export type PipelineDraftField =
  | `gate:${string}`
  | `phase-order:${GatePhase}`
  | `prepare:${string}`
  | 'prepare-order'
  | `role:${PipelineAgentRole}`
  | 'review'
  | 'airlock'
  | `approval:${PipelineApproval}`
  | 'constitution';

export type SetupEditAuthor = 'agent' | 'user';

/** `E1`, `E2`, …: who changed which field, for attribution and Undo; the summary is the author's own sentence. */
export interface SetupEdit {
  editId:  string;
  by:      SetupEditAuthor;
  field:   PipelineDraftField;
  summary: string;
  undone:  boolean;
}

export type ApplyRequestState = 'committing' | 'held' | 'refused';

/** Why the constitution commit holds or was refused: stored codes, worded only for display. */
export type ApplyRequestReason =
  | 'not-on-target-branch'
  | 'dirty-checkout'
  | 'target-file-held'
  | 'git-failed'
  | 'constitution-commit-unsigned'
  | 'constitution-commit-unexpected-paths'
  | 'constitution-moved';

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

export interface SetupNextNumbers {
  finding:  number;
  question: number;
  edit:     number;
}

export interface PipelineSetup {
  formatVersion:              1;
  /** `S1`, `S2`, …: never reused. */
  setupId:                    string;
  mode:                       PipelineSetupMode;
  /** The stored pipeline's content hash when an update or advise record opened; null for a first setup. */
  baseContentHash:            string | null;
  stepStates:                 Record<PipelineSetupStep, PipelineSetupStepState>;
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
  nextNumbers:                SetupNextNumbers;
  /** Keys this build does not know, kept in order so a round trip stays byte-identical. */
  extra:                      Array<[string, unknown]>;
}

/** `pipeline-setup.json` as read: no open record, the record, or a file the board cannot use, which nothing writes over. */
export type PipelineSetupReading =
  | { verdict: 'absent' }
  | { verdict: 'readable'; setup: PipelineSetup }
  | { verdict: 'malformed'; reason: string };

/** Main's `CONSTITUTION.md` when a record opens: its text byte for byte and its blob id. */
export interface MainConstitution {
  markdown: string;
  blob:     string;
}

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

/** One edit of the draft, addressed as its field names it; a `null` value removes what the field names, or writes its default back. */
export type PipelineDraftEdit =
  | { target: 'gate'; name: string; value: PipelineGate | null }
  | { target: 'phase-order'; phase: GatePhase; names: string[] }
  | { target: 'prepare'; name: string; value: PipelineStep | null }
  | { target: 'prepare-order'; names: string[] }
  | { target: 'role'; role: PipelineAgentRole; value: AgentStepSettings | null }
  | { target: 'review'; value: PipelineReview | null }
  | { target: 'airlock'; value: PipelineAirlock | null }
  | { target: 'approval'; approval: PipelineApproval; value: boolean | null }
  | { target: 'constitution'; value: PipelineConstitution | null };

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
