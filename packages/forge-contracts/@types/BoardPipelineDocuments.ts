/**
 * The board document's pipeline facts: the stored pipeline as read, the open setup, update or advise record with what it holds, the flow a
 * view draws with its nodes, edges and marks, the gates' profile runs, cache marks and step run times, the newest pipeline records, the
 * choices a step may take, and the typed draft edits a command sends and an entity refusal's fix holds. Values only, never words: a view
 * words every kind, role and label, but the sentence of a refusal and the label of its fix, which are forge's.
 */
import type {
  AgentEffort,
  AgentModel,
  EntityAgentRole,
  EntityKey,
  EntityKind,
  GatePhase,
  JobState,
  PipelineAgentRole
} from '../constants/BoardVocabulary.ts';
import type {
  AgentToolDocument,
  PipelineAgentDocument,
  PipelineToolDocument,
  PipelineToolRequestDocument
} from './BoardAgentDocuments.ts';
import type { ForgeRefusalDocument } from './ForgeRefusalDocument.ts';


export interface AgentPairDocument {
  readonly model:  AgentModel;
  readonly effort: AgentEffort;
}

export interface PipelineStepDocument {
  readonly name: string;
  readonly run:  string;
  /** The folder the step runs in; absent runs it in the project's folder. */
  readonly in?:  string;
}

export interface PipelineGateDocument {
  readonly name:       string;
  readonly run:        string;
  /** The shell line that repairs what the gate reports, such as a formatter. */
  readonly fix?:       string;
  /** The folder the gate runs in, relative to the project's folder, or to the repository's root when it leads with `/`. */
  readonly in?:        string;
  /** The pathspec patterns of the files that define the gate. */
  readonly definedBy?: readonly string[];
  /** The domains the gate may reach. */
  readonly network?:   readonly string[];
  /** The folders the gate may write besides the worktree and temp. */
  readonly writes?:    readonly string[];
  /** Run by the forge alone, never by an agent in its worktree. */
  readonly forgeOnly?: true;
}

/** The gate names of each phase, in run order. */
export type PipelinePhaseOrdersDocument = Readonly<Record<GatePhase, readonly string[]>>;

export type InstructionEntryDocument =
  | { readonly kind: 'constitution' }
  | { readonly kind: 'default-brief'; readonly role: PipelineAgentRole }
  | { readonly kind: 'file'; readonly path: string };

export interface AgentStepSettingsDocument {
  readonly model?:        AgentModel;
  readonly effort?:       AgentEffort;
  /** Read top to bottom; absent is the role's default list. */
  readonly instructions?: readonly InstructionEntryDocument[];
}

/** Present means on: a re-review runs when the fixes change more than `thresholdLines` lines. */
export interface ConditionalReReviewDocument {
  readonly thresholdLines: number;
}

export interface PipelineReviewDocument {
  readonly name:      string;
  readonly reReview?: ConditionalReReviewDocument;
}

export interface PipelineAirlockDocument {
  readonly reReview?: ConditionalReReviewDocument;
}

export interface PipelineConstitutionDocument {
  readonly path: string;
}

/** A human gate: `tickets` is the ticket review before an agent can pick a ticket up; `merge` the user's accept before the Airlock. */
export type PipelineApproval = 'tickets' | 'merge';

/** How the agents are billed: by the login, or by an API key's account, `maxBudgetUsd` capping each launch of a session. */
export type PipelineBillingDocument =
  | { readonly mode: 'subscription' }
  | { readonly mode: 'api'; readonly maxBudgetUsd?: number };

/** One part of a monorepo with its own constitution, pipeline and agents, under the forge's one intake and board. */
export interface PipelineEntityDocument {
  readonly kind:          EntityKind;
  /** Repository folders, each leading with `/`; the deepest folder that holds a path owns it. */
  readonly home:          readonly string[];
  readonly summary?:      string;
  /** Absent: the installed default constitution. */
  readonly constitution?: PipelineConstitutionDocument;
  readonly prepare:       readonly PipelineStepDocument[];
  readonly gates:         readonly PipelineGateDocument[];
  readonly phases:        PipelinePhaseOrdersDocument;
  /** Present: the review phase is on. */
  readonly review?:       PipelineReviewDocument;
  readonly agents?:       Readonly<Partial<Record<EntityAgentRole, AgentStepSettingsDocument>>>;
  /** The package entities its tickets may cross into. */
  readonly whitelist?:    readonly EntityKey[];
  /** The repository paths outside its homes its builder may change, owned by the root entity. */
  readonly reach?:        readonly string[];
  /** The entities it consumes, whose change runs its gates. */
  readonly dependsOn?:    readonly EntityKey[];
  /** The most jobs of this entity that run at once, under the board's limit. */
  readonly concurrency?:  number;
}

/** A pipeline as the forge holds it; beside `entities` the top-level steps are empty and each entity's own run instead. */
export interface PipelineDefinitionDocument {
  readonly version:       number;
  readonly prepare:       readonly PipelineStepDocument[];
  /** Every gate, defined once; an empty list is no gates on purpose. */
  readonly gates:         readonly PipelineGateDocument[];
  readonly phases:        PipelinePhaseOrdersDocument;
  readonly review?:       PipelineReviewDocument;
  readonly airlock?:      PipelineAirlockDocument;
  readonly constitution?: PipelineConstitutionDocument;
  readonly agents?:       Readonly<Partial<Record<PipelineAgentRole, AgentStepSettingsDocument>>>;
  /** An absent `tickets` approval is on; an absent `merge` approval is off. */
  readonly approvals?:    Readonly<Partial<Record<PipelineApproval, boolean>>>;
  /** Absent bills by subscription. */
  readonly billing?:      PipelineBillingDocument;
  readonly reach?:        readonly string[];
  /** Present: a forge at the repository's root over these entities. */
  readonly entities?:     Readonly<Record<EntityKey, PipelineEntityDocument>>;
  /** Present: the board turned the Assistant on; absent is off. */
  readonly assistant?:    true;
  /** Absent: no agent is chosen, and no job launches. */
  readonly agent?:        PipelineAgentDocument;
  /** Absent: the tools follow the pipeline's programs, found at each launch. */
  readonly tools?:        readonly PipelineToolDocument[];
}

/** The newest Apply. */
export interface BoardPipelineApplicationDocument {
  /** 1 for the first Apply, then one more for each. */
  readonly appliedRevision:    number;
  readonly appliedAt:          string;
  readonly appliedBy:          'user';
  /** The constitution commit that Apply landed on the main line; `null` when it made none. */
  readonly constitutionCommit: string | null;
}

/** The stored pipeline as read: none, one an older forge wrote, one the forge cannot read, or the pipeline. */
export type BoardAppliedPipelineDocument =
  | { readonly readingVerdict: 'absent' }
  | { readonly readingVerdict: 'older'; readonly fileText: string }
  | { readonly readingVerdict: 'malformed'; readonly reason: string; readonly fileText: string }
  | {
    readonly readingVerdict:  'readable';
    readonly pipeline:        PipelineDefinitionDocument;
    readonly contentHash:     string;
    /** The stored text, to show as it is. */
    readonly fileText:        string;
    /** `null` for a pipeline no Apply wrote. */
    readonly application:     BoardPipelineApplicationDocument | null;
    /** Each entity's pipeline as it runs, the forge's merge train, approvals and billing joined to its own; empty without entities. */
    readonly entityPipelines: Readonly<Record<EntityKey, PipelineDefinitionDocument>>;
  };

/** `entities` is walked only by a record of a forge over entities. */
export type PipelineSetupStep = 'billing' | 'agent' | 'research' | 'entities' | 'constitution' | 'design' | 'apply';

/** A later `done` step becomes `needs-recheck` when an earlier one reopens. */
export type PipelineSetupStepState = 'not-started' | 'in-progress' | 'done' | 'needs-recheck';

/** Every step but `entities` has a state; `entities` has one only once the record walks it. */
export type PipelineSetupStepStatesDocument =
  & Readonly<Record<Exclude<PipelineSetupStep, 'entities'>, PipelineSetupStepState>>
  & { readonly entities?: PipelineSetupStepState };

/** `setup` designs the first pipeline; `update` changes an applied one; `advise` is an update the pipeline agent starts on. */
export type PipelineSetupMode = 'setup' | 'update' | 'advise';

/** `layout` reports the repository's stand-alone codebases, from which the `entities` step proposes entities. */
export type ResearchFindingTopic = 'stack' | 'scripts' | 'conventions' | 'continuous-integration' | 'note' | 'layout';

export type GateCandidacy = 'gate' | 'not-a-gate' | 'unsure';

/** A script the research recorded; it is never run during the research. */
export interface ResearchScriptDocument {
  readonly name:          string;
  readonly run:           string;
  readonly meaning:       string;
  readonly gateCandidate: GateCandidacy;
  /** What the script needs besides the tree, such as a network or a service. */
  readonly needs:         readonly string[];
}

/** `F1`, `F2`, …: one thing the pipeline agent found in the repository. */
export interface ResearchFindingDocument {
  readonly findingId:    string;
  readonly topic:        ResearchFindingTopic;
  readonly label:        string;
  readonly value:        string | null;
  readonly sourcePaths:  readonly string[];
  readonly script:       ResearchScriptDocument | null;
  readonly needsRecheck: boolean;
}

/** The steps the pipeline agent works on, where it asks and suggests a Continue. */
export type SetupQuestionStep = Extract<PipelineSetupStep, 'research' | 'entities' | 'constitution' | 'design'>;

/** What a question blocks: only that node, gate, rule or finding waits for its answer. */
export interface SetupQuestionSubjectDocument {
  readonly kind:      'node' | 'gate' | 'rule' | 'finding';
  readonly reference: string;
}

export interface SetupQuestionOptionDocument {
  /** `a` to `d`, in the order the options were given. */
  readonly letter: string;
  readonly text:   string;
}

/** The chosen option letters in the order given, or free text: never both. */
export type SetupQuestionAnswerDocument =
  | { readonly letters: readonly string[]; readonly answeredAt: string }
  | { readonly text: string; readonly answeredAt: string };

/** `Q1`, `Q2`, …: a question of the pipeline agent with its step and subject. */
export interface SetupQuestionDocument {
  readonly questionId:  string;
  readonly step:        SetupQuestionStep;
  readonly subject:     SetupQuestionSubjectDocument | null;
  readonly question:    string;
  readonly context:     string;
  readonly options:     readonly SetupQuestionOptionDocument[];
  readonly recommended: readonly string[];
  readonly multiple:    boolean;
  /** `null` while the question is open. */
  readonly answer:      SetupQuestionAnswerDocument | null;
}

export type SourceAnnotationKind = 'contributing' | 'research' | 'installed-default';

/** A source the agent named for one line: anchored to that line's exact text and its occurrence among equal lines. */
export interface SourceAnnotationDocument {
  readonly lineText:   string;
  /** 1 for the first line with that text, 2 for the second, and so on. */
  readonly occurrence: number;
  readonly kind:       SourceAnnotationKind;
  /** The repository-relative source path; `null` when the source has no file. */
  readonly path:       string | null;
}

/** What the user asked the agent to draft the constitution from. */
export interface ConstitutionSourcesDocument {
  readonly contributing:     boolean;
  readonly research:         boolean;
  readonly installedDefault: boolean;
}

/** A constitution being drafted, as free markdown; its sources live beside it and never in the text. */
export interface ConstitutionDraftDocument {
  readonly markdown:    string;
  readonly annotations: readonly SourceAnnotationDocument[];
  readonly draftedFrom: ConstitutionSourcesDocument;
  /** The main line's blob of the constitution when the record opened; `null` when the main line had no such file. */
  readonly baseBlob:    string | null;
  readonly revision:    number;
}

/** A field of what a pipeline and an entity both hold. */
export type PipelineStepsDraftField =
  | `gate:${string}`
  | `phase-order:${GatePhase}`
  | `prepare:${string}`
  | 'prepare-order'
  | 'review'
  | 'constitution';

/** A field inside one entity. */
export type EntityDraftField =
  | PipelineStepsDraftField
  | `role:${EntityAgentRole}`
  | 'whitelist'
  | 'reach'
  | 'depends-on'
  | 'concurrency';

/** An addressable part of the draft pipeline: `entity:<key>` is an entity's definition, `entity:<key>/<field>` a field inside it. */
export type PipelineDraftField =
  | PipelineStepsDraftField
  | `role:${PipelineAgentRole}`
  | 'airlock'
  | 'tools'
  | `approval:${PipelineApproval}`
  | `entity:${EntityKey}`
  | `entity:${EntityKey}/${EntityDraftField}`;

/** `E1`, `E2`, …: who changed which field, for attribution and Undo; the summary is the author's own sentence. */
export interface SetupEditDocument {
  readonly editId:  string;
  readonly by:      'agent' | 'user';
  readonly field:   PipelineDraftField;
  readonly summary: string;
  readonly undone:  boolean;
  /** The first edit id of the set one copy to another entity made, so the set can be undone at once. */
  readonly batch?:  string;
}

export type ApplyRequestState = 'committing' | 'held' | 'refused';

/** Why the constitution commit holds or was refused, as a code a view words. */
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
  | 'entity-named-by-tickets'
  | 'entities-while-tickets-in-flight';

/** An Apply waiting for the Airlock's commit of the constitution before the pipeline is stored. */
export interface ApplyRequestDocument {
  readonly draftRevision: number;
  readonly resumesBoard:  boolean;
  /** `null` while no job holds the commit. */
  readonly commitJobId:   string | null;
  readonly state:         ApplyRequestState;
  /** `null` while committing. */
  readonly reason:        ApplyRequestReason | null;
}

/** A check the user asked for: waiting for a slot, running, judged, unable to judge anything, or ended by a stop with no result. */
export type PipelineCheckState = 'queued' | 'running' | 'checked' | 'cannot-run' | 'stopped';

/** What a touched gate did in the two runs: `disagreeing` when the two runs differ. */
export type CheckedGateVerdict = 'green' | 'red' | 'cannot-run' | 'disagreeing';

export interface CheckedGateDocument {
  readonly name:                  string;
  readonly outcomes:              readonly ('passed' | 'failed' | 'cannot-run')[];
  /** Recorded and shown only. */
  readonly durationsMilliseconds: readonly number[];
  readonly verdict:               CheckedGateVerdict;
  /** The end of the last red or unrunnable run's output; empty when both runs passed. */
  readonly output:                string;
}

/** The two runs of the draft's prepare steps and its touched gates in a fresh worktree of the main line. */
export interface PipelineCheckResultDocument {
  readonly snapshotCommit: string;
  /** The first prepare step that did not exit 0 in each run, `null` where every one did; and the end of its output. */
  readonly prepare:        { readonly failedSteps: readonly (string | null)[]; readonly output: string };
  readonly gates:          readonly CheckedGateDocument[];
}

/** The user's check of the gates the draft touches: only those gates run, twice. */
export interface PipelineCheckDocument {
  readonly draftRevision: number;
  /** The gates the draft changes or adds, in draft order. */
  readonly gateNames:     readonly string[];
  readonly state:         PipelineCheckState;
  /** Set only once `checked`. */
  readonly result:        PipelineCheckResultDocument | null;
  /** Why a `cannot-run` check judged nothing; `null` in every other state. */
  readonly reason:        string | null;
}

/** One entity's part of the record: its pipeline agent session, findings, questions, constitution draft and newest check. */
export interface PipelineSetupEntityDocument {
  readonly agentJobId:   string | null;
  readonly findings:     readonly ResearchFindingDocument[];
  readonly questions:    readonly SetupQuestionDocument[];
  readonly constitution: ConstitutionDraftDocument | null;
  /** `null` until the user first asks for a check of this entity. */
  readonly check:        PipelineCheckDocument | null;
}

/** The open setup, update or advise record of the pipeline agent. */
export interface PipelineSetupRecordDocument {
  /** `S1`, `S2`, …: never reused. */
  readonly setupId:                    string;
  readonly mode:                       PipelineSetupMode;
  /** The stored pipeline's content hash when an update or advise record opened; `null` for a first setup. */
  readonly baseContentHash:            string | null;
  readonly stepStates:                 PipelineSetupStepStatesDocument;
  readonly currentStep:                PipelineSetupStep;
  readonly billing:                    PipelineBillingDocument;
  /** The agent the record's pipeline agent runs on and Apply stores; `null` until the user chose one. */
  readonly agent:                      PipelineAgentDocument | null;
  /** The design's tools: each program the draft runs, else the stored pipeline's, found now, and the draft's own list where it keeps one. */
  readonly tools:                      readonly AgentToolDocument[];
  readonly agentJobId:                 string | null;
  /** The main line's commit the agent's snapshot holds. */
  readonly snapshotCommit:             string | null;
  /** The agent's suggestion to continue; it never moves a step. */
  readonly readyToContinue:            readonly PipelineSetupStep[];
  readonly findings:                   readonly ResearchFindingDocument[];
  readonly questions:                  readonly SetupQuestionDocument[];
  readonly constitution:               ConstitutionDraftDocument | null;
  /** The full pipeline being designed. */
  readonly draft:                      PipelineDefinitionDocument | null;
  readonly draftRevision:              number;
  readonly edits:                      readonly SetupEditDocument[];
  readonly replacesUnreadablePipeline: boolean;
  readonly applyRequest:               ApplyRequestDocument | null;
  /** `null` until the user first asks for a check. */
  readonly check:                      PipelineCheckDocument | null;
  /** Absent on a forge without entities; each entity's part by its key. */
  readonly entities?:                  Readonly<Record<EntityKey, PipelineSetupEntityDocument>>;
  /** An update or advise opened at an entity: that entity's key; absent at the forge. */
  readonly openedAtEntity?:            EntityKey;
}

/** What a view summarises each setup step with, as counts. */
export interface PipelineSetupSummaryDocument {
  readonly stackItemCount:                number;
  readonly scriptCount:                   number;
  /** Only the research step's answered questions. */
  readonly answeredResearchQuestionCount: number;
  readonly prepareStepCount:              number;
  readonly gateCountByPhase:              Readonly<Record<GatePhase, number>>;
  /** The draft edits by the user that are not undone. */
  readonly userEditsKeptCount:            number;
}

/** The summary of one entity; the user's edits are counted for the whole draft. */
export type PipelineSetupEntitySummaryDocument = Omit<PipelineSetupSummaryDocument, 'userEditsKeptCount'>;

/** The `##` lines and the top-level `-` items of the constitution's markdown. */
export interface ConstitutionOutlineDocument {
  readonly sectionCount: number;
  readonly ruleCount:    number;
}

/** An annotation with the zero-based index of the markdown line it anchors to. */
export interface ResolvedSourceAnnotationDocument extends SourceAnnotationDocument {
  readonly lineIndex: number;
}

/** The pending Apply, with what holds it: the files that block the main checkout and the ticket whose Airlock holds the main line. */
export interface ApplyStateDocument extends ApplyRequestDocument {
  readonly blockingFiles:       readonly string[];
  readonly ticketIdHoldingMain: string | null;
}

/** One entity's part of the setup facts. */
export interface PipelineSetupEntityFactsDocument {
  readonly summary:              PipelineSetupEntitySummaryDocument;
  readonly openQuestionCount:    number;
  /** The state of the entity's pipeline agent job; `null` when none is on the board. */
  readonly agentJobState:        JobState | null;
  readonly constitutionMarkdown: string | null;
  readonly constitutionOutline:  ConstitutionOutlineDocument | null;
  readonly annotations:          readonly ResolvedSourceAnnotationDocument[];
  /** The entity's roles whose instruction lists hold its constitution. */
  readonly readByRoles:          readonly EntityAgentRole[];
}

/** The open record and what the forge reads around it. */
export interface BoardPipelineSetupDocument {
  readonly record:               PipelineSetupRecordDocument;
  readonly summary:              PipelineSetupSummaryDocument;
  readonly openQuestionCount:    number;
  /** `null` when no agent job is on the board. */
  readonly agentJobState:        JobState | null;
  /** The main line's commits since the snapshot. */
  readonly mainMovedByCommits:   number;
  /** The constitution's Markdown as stored; `null` with no constitution. */
  readonly constitutionMarkdown: string | null;
  readonly constitutionOutline:  ConstitutionOutlineDocument | null;
  readonly annotations:          readonly ResolvedSourceAnnotationDocument[];
  /** The roles whose instruction lists hold the constitution. */
  readonly readByRoles:          readonly PipelineAgentRole[];
  readonly applyState:           ApplyStateDocument | null;
  /** Absent on a forge without entities: each entity of the draft, else of the stored pipeline, by its key. */
  readonly entities?:            Readonly<Record<EntityKey, PipelineSetupEntityFactsDocument>>;
  /** Each entity of the draft by its key; empty while the draft holds none. */
  readonly draftEntities:        Readonly<Record<EntityKey, BoardDraftEntityFactsDocument>>;
  /** The refusal an Apply of the current draft meets now, as the command would answer it; `null` when it would proceed. */
  readonly applyRefusal:         ForgeRefusalDocument | null;
  /** Each refusal the draft's entities hold, which Continue and Apply wait on; empty while none stands. */
  readonly entityRefusals:       readonly BoardEntityRefusalDocument[];
}

export interface PipelineEntityDefinitionDocument {
  readonly kind:     EntityKind;
  readonly home:     readonly string[];
  readonly summary?: string;
}

/** An edit of what a pipeline and an entity both hold; a `null` value removes what it names. */
export type PipelineStepsDraftEditDocument =
  | { readonly target: 'gate'; readonly name: string; readonly value: PipelineGateDocument | null }
  | { readonly target: 'phase-order'; readonly phase: GatePhase; readonly names: readonly string[] }
  | { readonly target: 'prepare'; readonly name: string; readonly value: PipelineStepDocument | null }
  | { readonly target: 'prepare-order'; readonly names: readonly string[] }
  | { readonly target: 'review'; readonly value: PipelineReviewDocument | null }
  | { readonly target: 'constitution'; readonly value: PipelineConstitutionDocument | null };

/** An edit inside one entity; a `null` value removes the key. */
export type EntityDraftEditDocument =
  | PipelineStepsDraftEditDocument
  | { readonly target: 'role'; readonly role: EntityAgentRole; readonly value: AgentStepSettingsDocument | null }
  | { readonly target: 'whitelist'; readonly value: readonly EntityKey[] | null }
  | { readonly target: 'reach'; readonly value: readonly string[] | null }
  | { readonly target: 'depends-on'; readonly value: readonly EntityKey[] | null }
  | { readonly target: 'concurrency'; readonly value: number | null };

/** One edit of the draft pipeline; a `null` value removes what it names, or writes its default back. */
export type PipelineDraftEditDocument =
  | PipelineStepsDraftEditDocument
  | { readonly target: 'role'; readonly role: PipelineAgentRole; readonly value: AgentStepSettingsDocument | null }
  | { readonly target: 'airlock'; readonly value: PipelineAirlockDocument | null }
  /** The draft's own tool list; a tool named alone is found by forge, and `null` follows the draft's programs again. */
  | { readonly target: 'tools'; readonly value: readonly PipelineToolRequestDocument[] | null }
  | { readonly target: 'approval'; readonly approval: PipelineApproval; readonly value: boolean | null }
  | { readonly target: 'entity'; readonly entityKey: EntityKey; readonly value: PipelineEntityDefinitionDocument | null }
  | { readonly target: 'within-entity'; readonly entityKey: EntityKey; readonly edit: EntityDraftEditDocument };

export type BoardEntityRefusalReason =
  | 'more-than-one-root'
  | 'equal-homes'
  | 'reach-inside-another-home'
  | 'unknown-whitelist-key'
  | 'unknown-dependency-key'
  | 'whitelisted-entity-not-package'
  | 'whitelisted-package-without-review'
  | 'dependency-circle';

/** The one gesture that resolves a refusal, as the draft edits it sends. */
export interface BoardEntityRefusalFixDocument {
  readonly label: string;
  readonly edits: readonly PipelineDraftEditDocument[];
}

/** One refusal of the draft's entities by the validator a stored pipeline must pass. */
export interface BoardEntityRefusalDocument {
  readonly reason:     BoardEntityRefusalReason;
  /** Every entity the refusal names. */
  readonly entityKeys: readonly EntityKey[];
  /** The entity whose row shows the refusal. */
  readonly shownOn:    EntityKey;
  /** What is wrong, and that Continue and Apply wait until it is fixed; the edit that left it is kept. */
  readonly sentence:   string;
  /** `null` when no one gesture resolves it. */
  readonly fix:        BoardEntityRefusalFixDocument | null;
}

/** What a view shows of one entity of the draft. */
export interface BoardDraftEntityFactsDocument {
  /** The entity's pipeline as it would run, the forge's merge train, approvals and billing joined to its own. */
  readonly effectivePipeline:   PipelineDefinitionDocument;
  /** Every entity that consumes this one, directly or through another, in the draft's order. */
  readonly dependentEntityKeys: readonly EntityKey[];
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

/** Where a merge of the main line into the ticket's tree sits: before review, before the user's code review, or in the merge train. */
export type MergePlacement = 'before-review' | 'before-human-code-review' | 'airlock';

/** Whose model and effort a merge step's derived meter shows: the ticket's last worker, or the builder. */
export type DerivedSettingsSource = 'last-worker' | 'builder';

export type PipelineSwitchState = 'on' | 'off';

/** One row of an agent step's instruction list, resolved to the file it reads. */
export interface ResolvedInstructionEntryDocument {
  readonly entry:       InstructionEntryDocument;
  readonly fileName:    string;
  /** The roles whose lists hold this entry. */
  readonly readByRoles: readonly PipelineAgentRole[];
  /** The file's text on the main line, cut at the preview limit; `null` when the file is not there. */
  readonly text:        string | null;
  readonly textIsCut:   boolean;
}

/** What opening a node shows; a node with no target opens nothing. */
export type PipelineNodeDialogTarget =
  | 'agent-step'
  | 'review-step'
  | 'review-step-re-review'
  | 'merge-step'
  | 'merge-step-re-review'
  | 'gates-tab';

export interface PipelineGateChipDocument {
  readonly gateName: string;
  readonly mark:     PipelineNodeMark;
}

export interface PipelineFlowNodeDocument {
  readonly nodeId:             string;
  readonly nodeKind:           PipelineNodeKind;
  readonly role:               PipelineAgentRole | null;
  /** The resolved model and effort of an agent step, or the derived pair of a merge step; `null` on other nodes. */
  readonly settings:           AgentPairDocument | null;
  readonly instructionEntries: readonly ResolvedInstructionEntryDocument[];
  readonly derivedFrom:        DerivedSettingsSource | null;
  /** Only on a `merge-main-into-tree` node. */
  readonly mergePlacement:     MergePlacement | null;
  /** Only on a `gates` node. */
  readonly phase:              GatePhase | null;
  readonly conditional:        boolean;
  /** Only on a conditional re-review node. */
  readonly thresholdLines:     number | null;
  /** Only on a switch node: the human ticket review and the human code review. */
  readonly switchState:        PipelineSwitchState | null;
  readonly gateChips:          readonly PipelineGateChipDocument[];
  readonly mark:               PipelineNodeMark;
  readonly dialogTarget:       PipelineNodeDialogTarget | null;
  readonly questionIds:        readonly string[];
}

export type PipelineEdgeTone = 'forward' | 'rollback' | 'loop';

/** The label of an edge, which a view words; `null` draws no label. */
export type PipelineEdgeLabelKind =
  | 'all-green'
  | 'red-builder-fixes'
  | 'conflict-or-red-builder-fixes'
  | 'red-reviewer-fixes'
  | 'red-last-worker-fixes'
  | 'gates-again-after-re-review';

export interface PipelineFlowEdgeDocument {
  readonly edgeId:    string;
  readonly from:      string;
  readonly to:        string;
  readonly tone:      PipelineEdgeTone;
  readonly labelKind: PipelineEdgeLabelKind | null;
  /** On the path a ticket takes now. */
  readonly active:    boolean;
}

export type PipelineInsertableStep =
  | 'build-gates'
  | 'review'
  | 'human-code-review'
  | 'review-gates'
  | 're-review'
  | 'merge-gates'
  | 'airlock-re-review';

/** A place where a step is missing; the steps that fit on one line share one slot. */
export interface PipelineInsertSlotDocument {
  readonly slotId:       string;
  readonly after:        string;
  readonly offeredSteps: readonly PipelineInsertableStep[];
}

/** A ticket, or a filing draft being written, on the node of its current step. */
export interface PipelineOccupantDocument {
  readonly occupantKind: 'ticket' | 'draft';
  readonly occupantId:   string;
  readonly nodeId:       string;
  readonly jobId:        string | null;
  readonly since:        string;
}

/** One row of a phase's tab in the gates area; prepare rows come first. */
export interface PipelineGateRowDocument {
  readonly rowKind:      'prepare' | 'gate';
  readonly name:         string;
  readonly run:          string;
  readonly fix:          string | null;
  readonly in:           string | null;
  readonly network:      readonly string[];
  /** The other phases the gate runs in; empty for a prepare row. */
  readonly alsoInPhases: readonly GatePhase[];
  readonly mark:         PipelineNodeMark;
}

/** One row of the change list between the applied pipeline, or the minimal one, and the draft. */
export interface PipelineChangeDocument {
  readonly field:      PipelineDraftField;
  readonly changeKind: 'changed' | 'new' | 'removed';
  /** The newest edit on this field that is not undone, which an Undo names; `null` when no edit made the change. */
  readonly editId:     string | null;
}

export type PipelineFlowStage = 'proposal' | 'live' | 'editing';

export type PipelineGateRowsDocument = Readonly<Record<GatePhase, readonly PipelineGateRowDocument[]>>;

/** The flow of one entity's pipeline; its tickets stand on the forge's flow. */
export interface PipelineEntityFlowDocument {
  readonly nodes:       readonly PipelineFlowNodeDocument[];
  readonly edges:       readonly PipelineFlowEdgeDocument[];
  readonly insertSlots: readonly PipelineInsertSlotDocument[];
  readonly gateRows:    PipelineGateRowsDocument;
}

export interface BoardPipelineFlowDocument {
  readonly nodes:             readonly PipelineFlowNodeDocument[];
  readonly edges:             readonly PipelineFlowEdgeDocument[];
  readonly insertSlots:       readonly PipelineInsertSlotDocument[];
  readonly occupants:         readonly PipelineOccupantDocument[];
  readonly gateRows:          PipelineGateRowsDocument;
  readonly changeList:        readonly PipelineChangeDocument[];
  readonly ticketIdsInFlight: readonly string[];
  readonly toolbarStage:      PipelineFlowStage;
  /** Absent on a forge without entities: the flow of each entity, by its key; the flow above is the forge's. */
  readonly entityFlows?:      Readonly<Record<EntityKey, PipelineEntityFlowDocument>>;
}

export type GateProfileRunState = 'queued' | 'running' | 'passed' | 'red' | 'cannot-run' | 'timed-out' | 'stopped';

/** What a gate reported of its own tool's cache: every task replayed from it, some, or none. */
export type GateCacheReport = 'hit' | 'partial' | 'miss';

/** The newest profile run of one gate in one phase; a run starts only on the user's press. */
export interface BoardGateProfileRunDocument {
  readonly profileRunId:        string;
  /** Only on a run of an entity's gate. */
  readonly entity?:             EntityKey;
  readonly gateName:            string;
  readonly phase:               GatePhase;
  readonly state:               GateProfileRunState;
  /** Recorded and shown only; `null` until the run started. */
  readonly elapsedMilliseconds: number | null;
  /** `null` while the gate reported nothing of its cache. */
  readonly cacheReport:         GateCacheReport | null;
}

/** What the newest run of a gate in a phase reported of its cache, a job's gate run or a profile run, whichever ended last. */
export interface BoardGateCacheMarkDocument {
  /** Only on a mark of an entity's gate. */
  readonly entity?:     EntityKey;
  readonly gateName:    string;
  readonly phase:       GatePhase;
  readonly cacheReport: GateCacheReport;
}

/** How a step line ended: `time-bound` when it was stopped at its bound, else as its run was judged. */
export type PipelineStepEnding = 'passed' | 'failed' | 'time-bound';

/** The newest run of one step line, by entity, step kind, step name and phase, so a slow step can be found and made faster. */
export interface BoardPipelineStepRunTimeDocument {
  /** Only on a step of an entity's pipeline. */
  readonly entity?:         EntityKey;
  /** A prepare step, a job's install included, or a gate. */
  readonly stepKind:        'prepare' | 'gate';
  readonly stepName:        string;
  /** The gate run's phase; absent for an install step. */
  readonly phase?:          GatePhase;
  /** Recorded and shown only, in the measure of the line's bound: a sleep does not count. */
  readonly runMilliseconds: number;
  readonly ending:          PipelineStepEnding;
  readonly at:              string;
}

/** A pipeline record the live view's history shows, newest first. */
export type BoardPipelineHistoryEntryDocument =
  | { readonly kind: 'pipeline-gate-added'; readonly at: string; readonly fields: { readonly name: string; readonly run: string } }
  | { readonly kind: 'pipeline-gate-removed'; readonly at: string; readonly fields: { readonly name: string } }
  | { readonly kind: 'pipeline-gates-none'; readonly at: string }
  | { readonly kind: 'pipeline-gates-ordered'; readonly at: string; readonly fields: { readonly phase: GatePhase; readonly names: readonly string[] } }
  | { readonly kind: 'pipeline-prepare-step-set'; readonly at: string; readonly fields: { readonly name: string; readonly run: string } }
  /** `state` is `on` or `off`. */
  | { readonly kind: 'pipeline-approval-set'; readonly at: string; readonly fields: { readonly approval: string; readonly state: string } }
  /** The Assistant's switch; `state` is `on` or `off`. */
  | { readonly kind: 'pipeline-assistant-set'; readonly at: string; readonly fields: { readonly state: string } }
  | {
    readonly kind:    'pipeline-setup-opened';
    readonly at:      string;
    readonly setupId: string;
    readonly fields:  { readonly mode: PipelineSetupMode; readonly replacesUnreadablePipeline: boolean };
  }
  | { readonly kind: 'pipeline-draft-discarded'; readonly at: string; readonly setupId: string; readonly fields: { readonly revision: number } }
  | { readonly kind: 'pipeline-setup-discarded'; readonly at: string; readonly setupId: string }
  | { readonly kind: 'hephaestus-set'; readonly at: string; readonly fields: { readonly state: 'running' | 'paused' } };

/** Every model and effort a step may take, in order. */
export interface BoardPipelineChoicesDocument {
  readonly models:  readonly AgentModel[];
  readonly efforts: readonly AgentEffort[];
}

/** One ticket the product owner gives an entity after the first Apply over entities; the last three are `null` while it waits. */
export interface EntityAssignmentTicketDocument {
  readonly ticketId:   string;
  /** `null` when the board no longer holds the ticket. */
  readonly title:      string | null;
  readonly entity:     EntityKey | null;
  readonly reason:     string | null;
  readonly assignedBy: 'product-owner' | 'user' | null;
}

/** The product owner the first Apply over entities started, and each of its tickets. */
export interface BoardEntityAssignmentDocument {
  readonly jobId:    string;
  /** `null` once the job ended. */
  readonly jobState: JobState | null;
  readonly tickets:  readonly EntityAssignmentTicketDocument[];
}
