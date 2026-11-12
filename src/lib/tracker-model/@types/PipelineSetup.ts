/**
 * The setup record, `<data>/pipeline-setup.json`: one open setup, update or advise session of the pipeline agent, saved as each answer,
 * edit and finding happens so every step can resume. Only an Apply writes `pipeline.json` from it.
 */
import type { DraftAnswer, DraftQuestionOption } from './Draft.ts';
import type { GatePhase }                        from './GatePhase.ts';
import type { GateOutcome }                      from './Job.ts';
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

/**
 * Why the constitution commit holds or was refused: stored codes, worded only for display. `pipeline-moved`: the stored pipeline changed
 * by hand while the commit waited, so the commit does not land.
 */
export type ApplyRequestReason =
  | 'not-on-target-branch'
  | 'dirty-checkout'
  | 'target-file-held'
  | 'git-failed'
  | 'constitution-commit-unsigned'
  | 'constitution-commit-unexpected-paths'
  | 'constitution-moved'
  | 'pipeline-moved';

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

/** A check User asked for: waiting for a slot, running, judged, unable to judge anything, or ended by an Overseer stop with no result. */
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
  /** Absent until User first asks for a check; then the newest check, written only once set. */
  check?:                     PipelineCheck;
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

/** Stage 1 of an Apply: the draft revision User saw, whether the board resumes, and main's constitution as the caller read it. */
export interface ApplyRequesting {
  draftRevision:    number;
  resumesBoard:     boolean;
  /** Null when main holds no `CONSTITUTION.md`. */
  mainConstitution: MainConstitution | null;
}

/** Stage 2 of an Apply: what main holds once the constitution is there, and the commit that put it there, null when none was made. */
export interface ApplyFinishing {
  draftRevision:      number;
  resumesBoard:       boolean;
  mainConstitution:   MainConstitution | null;
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
