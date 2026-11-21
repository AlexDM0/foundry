/**
 * A forge's pipeline facts as Gaia holds them: the stored pipeline as read with each entity's effective pipeline, the open setup record with
 * its entities draft, the entity refusals and the Apply refusal the forge serves, the flow a view draws, the gates' profile runs, cache
 * marks and step run times, the pipeline history, and the choices a step may take. Values only: the forge words only its refusals and the
 * label of a refusal's fix.
 */
import type { BoardRefusal }                             from './BoardRefusal.ts';
import type { BoardQuestionAnswer, BoardQuestionOption } from './BoardTicket.ts';
import type {
  BoardAgentEffort,
  BoardAgentModel,
  BoardApplyRequestReason,
  BoardApplyRequestState,
  BoardAssignedBy,
  BoardCacheReport,
  BoardChangeKind,
  BoardCheckedGateVerdict,
  BoardCheckState,
  BoardDerivedSettingsSource,
  BoardEdgeLabelKind,
  BoardEdgeTone,
  BoardEditAuthor,
  BoardEntityAgentRole,
  BoardEntityKind,
  BoardEntityRefusalReason,
  BoardFindingTopic,
  BoardFlowStage,
  BoardGateCandidacy,
  BoardGatePhase,
  BoardGateRowKind,
  BoardInsertableStep,
  BoardJobState,
  BoardMergePlacement,
  BoardNodeDialogTarget,
  BoardOccupantKind,
  BoardOverseerSetting,
  BoardPipelineAgentRole,
  BoardPipelineApproval,
  BoardPipelineNodeKind,
  BoardPipelineNodeMark,
  BoardProfileRunState,
  BoardSetupMode,
  BoardSetupQuestionStep,
  BoardSetupQuestionSubjectKind,
  BoardSetupStep,
  BoardSetupStepState,
  BoardSourceAnnotationKind,
  BoardStepEnding,
  BoardStepKind,
  BoardSwitchState,
} from './BoardVocabulary.ts';

export interface BoardAgentPair {
  readonly model:  BoardAgentModel;
  readonly effort: BoardAgentEffort;
}

export interface BoardPipelineStep {
  readonly name:   string;
  readonly run:    string;
  /** The folder the step runs in; `null` runs it in the project's folder. */
  readonly runsIn: string | null;
}

export interface BoardPipelineGate {
  readonly name:    string;
  readonly run:     string;
  readonly fix:     string | null;
  readonly runsIn:  string | null;
  readonly network: readonly string[];
  readonly writes:  readonly string[];
}

export type BoardPhaseOrders = Readonly<Record<BoardGatePhase, readonly string[]>>;

export type BoardInstruction =
  | { readonly kind: 'constitution' }
  | { readonly kind: 'default-brief'; readonly role: BoardPipelineAgentRole }
  | { readonly kind: 'file'; readonly path: string };

/** `null` where the pipeline names none, which the role's default fills. */
export interface BoardAgentStepSettings {
  readonly model:        BoardAgentModel | null;
  readonly effort:       BoardAgentEffort | null;
  readonly instructions: readonly BoardInstruction[] | null;
}

export interface BoardConditionalReReview {
  readonly thresholdLines: number;
}

export interface BoardPipelineReview {
  readonly name:     string;
  readonly reReview: BoardConditionalReReview | null;
}

export interface BoardPipelineAirlock {
  readonly reReview: BoardConditionalReReview | null;
}

export type BoardBilling =
  | { readonly mode: 'subscription' }
  | { readonly mode: 'api'; readonly maximumBudgetDollars: number | null };

export interface BoardPipelineEntity {
  readonly kind:             BoardEntityKind;
  readonly home:             readonly string[];
  readonly summary:          string | null;
  /** `null`: the installed default constitution. */
  readonly constitutionPath: string | null;
  readonly prepare:          readonly BoardPipelineStep[];
  readonly gates:            readonly BoardPipelineGate[];
  readonly phases:           BoardPhaseOrders;
  readonly review:           BoardPipelineReview | null;
  readonly agents:           Readonly<Partial<Record<BoardEntityAgentRole, BoardAgentStepSettings>>>;
  readonly whitelist:        readonly string[];
  readonly reach:            readonly string[];
  readonly dependsOn:        readonly string[];
  readonly concurrency:      number | null;
}

/** A pipeline as the forge holds it; the forge's rules for what it leaves out stay the forge's, so absent stays absent here. */
export interface BoardPipelineDefinition {
  readonly version:          number;
  readonly prepare:          readonly BoardPipelineStep[];
  readonly gates:            readonly BoardPipelineGate[];
  readonly phases:           BoardPhaseOrders;
  readonly review:           BoardPipelineReview | null;
  readonly airlock:          BoardPipelineAirlock | null;
  readonly constitutionPath: string | null;
  readonly agents:           Readonly<Partial<Record<BoardPipelineAgentRole, BoardAgentStepSettings>>>;
  readonly approvals:        Readonly<Partial<Record<BoardPipelineApproval, boolean>>>;
  readonly billing:          BoardBilling | null;
  readonly reach:            readonly string[];
  /** `null` for a forge over no entities. */
  readonly entities:         Readonly<Record<string, BoardPipelineEntity>> | null;
}

export interface BoardPipelineApplication {
  readonly appliedRevision:    number;
  readonly appliedAt:          string;
  readonly constitutionCommit: string | null;
}

export type BoardAppliedPipeline =
  | { readonly readingVerdict: 'absent' }
  | { readonly readingVerdict: 'older'; readonly fileText: string }
  | { readonly readingVerdict: 'malformed'; readonly reason: string; readonly fileText: string }
  | {
    readonly readingVerdict:  'readable';
    readonly pipeline:        BoardPipelineDefinition;
    readonly contentHash:     string;
    readonly fileText:        string;
    readonly application:     BoardPipelineApplication | null;
    /** Each entity's pipeline as it runs, as the forge joined it; empty without entities. */
    readonly entityPipelines: Readonly<Record<string, BoardPipelineDefinition>>;
  };

export type BoardSetupStepStates = Readonly<Record<Exclude<BoardSetupStep, 'entities'>, BoardSetupStepState>> & {
  /** `null` until the record walks the step. */
  readonly entities: BoardSetupStepState | null;
};

export interface BoardResearchScript {
  readonly name:          string;
  readonly run:           string;
  readonly meaning:       string;
  readonly gateCandidate: BoardGateCandidacy;
  readonly needs:         readonly string[];
}

export interface BoardResearchFinding {
  readonly findingId:    string;
  readonly topic:        BoardFindingTopic;
  readonly label:        string;
  readonly value:        string | null;
  readonly sourcePaths:  readonly string[];
  readonly script:       BoardResearchScript | null;
  readonly needsRecheck: boolean;
}

export interface BoardSetupQuestionSubject {
  readonly kind:      BoardSetupQuestionSubjectKind;
  readonly reference: string;
}

export interface BoardSetupQuestion {
  readonly questionId:  string;
  readonly step:        BoardSetupQuestionStep;
  readonly subject:     BoardSetupQuestionSubject | null;
  readonly question:    string;
  readonly context:     string;
  readonly options:     readonly BoardQuestionOption[];
  readonly recommended: readonly string[];
  readonly multiple:    boolean;
  readonly answer:      BoardQuestionAnswer | null;
}

export interface BoardSourceAnnotation {
  readonly lineText:   string;
  readonly occurrence: number;
  readonly kind:       BoardSourceAnnotationKind;
  readonly path:       string | null;
}

export interface BoardConstitutionSources {
  readonly contributing:     boolean;
  readonly research:         boolean;
  readonly installedDefault: boolean;
}

export interface BoardConstitutionDraft {
  readonly markdown:    string;
  readonly annotations: readonly BoardSourceAnnotation[];
  readonly draftedFrom: BoardConstitutionSources;
  readonly revision:    number;
}

export interface BoardSetupEdit {
  readonly editId:  string;
  readonly by:      BoardEditAuthor;
  /** The draft field the forge names, such as `gate:unit` or `entity:web/reach`. */
  readonly field:   string;
  readonly summary: string;
  readonly undone:  boolean;
  readonly batch:   string | null;
}

export interface BoardCheckedGate {
  readonly name:    string;
  readonly verdict: BoardCheckedGateVerdict;
  readonly output:  string;
}

export interface BoardCheckResult {
  readonly snapshotCommit:     string;
  readonly prepareFailedSteps: readonly (string | null)[];
  readonly prepareOutput:      string;
  readonly gates:              readonly BoardCheckedGate[];
}

export interface BoardPipelineCheck {
  readonly draftRevision: number;
  readonly gateNames:     readonly string[];
  readonly state:         BoardCheckState;
  readonly result:        BoardCheckResult | null;
  readonly reason:        string | null;
}

export interface BoardSetupEntity {
  readonly agentJobId:   string | null;
  readonly findings:     readonly BoardResearchFinding[];
  readonly questions:    readonly BoardSetupQuestion[];
  readonly constitution: BoardConstitutionDraft | null;
  readonly check:        BoardPipelineCheck | null;
}

export interface BoardSetupRecord {
  readonly setupId:                    string;
  readonly mode:                       BoardSetupMode;
  readonly stepStates:                 BoardSetupStepStates;
  readonly currentStep:                BoardSetupStep;
  readonly billing:                    BoardBilling;
  readonly agentJobId:                 string | null;
  readonly snapshotCommit:             string | null;
  readonly readyToContinue:            readonly BoardSetupStep[];
  readonly findings:                   readonly BoardResearchFinding[];
  readonly questions:                  readonly BoardSetupQuestion[];
  readonly constitution:               BoardConstitutionDraft | null;
  readonly draft:                      BoardPipelineDefinition | null;
  readonly draftRevision:              number;
  readonly edits:                      readonly BoardSetupEdit[];
  readonly replacesUnreadablePipeline: boolean;
  readonly check:                      BoardPipelineCheck | null;
  /** `null` on a forge over no entities. */
  readonly entities:                   Readonly<Record<string, BoardSetupEntity>> | null;
}

export interface BoardSetupEntitySummary {
  readonly stackItemCount:                number;
  readonly scriptCount:                   number;
  readonly answeredResearchQuestionCount: number;
  readonly prepareStepCount:              number;
  readonly gateCountByPhase:              Readonly<Record<BoardGatePhase, number>>;
}

export interface BoardSetupSummary extends BoardSetupEntitySummary {
  readonly userEditsKeptCount: number;
}

export interface BoardConstitutionOutline {
  readonly sectionCount: number;
  readonly ruleCount:    number;
}

export interface BoardApplyState {
  readonly draftRevision:       number;
  readonly resumesBoard:        boolean;
  readonly state:               BoardApplyRequestState;
  readonly reason:              BoardApplyRequestReason | null;
  readonly blockingFiles:       readonly string[];
  readonly ticketIdHoldingMain: string | null;
}

export interface BoardSetupEntityFacts {
  readonly summary:              BoardSetupEntitySummary;
  readonly openQuestionCount:    number;
  readonly agentJobState:        BoardJobState | null;
  readonly constitutionMarkdown: string | null;
  readonly constitutionOutline:  BoardConstitutionOutline | null;
  readonly annotations:          readonly BoardSourceAnnotation[];
  readonly readByRoles:          readonly BoardEntityAgentRole[];
}

/** What a view shows of one entity of the draft: its pipeline as it would run, and every entity that consumes it. */
export interface BoardDraftEntityFacts {
  readonly effectivePipeline:   BoardPipelineDefinition;
  readonly dependentEntityKeys: readonly string[];
}

export interface BoardPipelineEntityDefinition {
  readonly kind:    BoardEntityKind;
  readonly home:    readonly string[];
  readonly summary: string | null;
}

export type BoardStepsDraftEdit =
  | { readonly target: 'gate'; readonly name: string; readonly value: BoardPipelineGate | null }
  | { readonly target: 'phase-order'; readonly phase: BoardGatePhase; readonly names: readonly string[] }
  | { readonly target: 'prepare'; readonly name: string; readonly value: BoardPipelineStep | null }
  | { readonly target: 'prepare-order'; readonly names: readonly string[] }
  | { readonly target: 'review'; readonly value: BoardPipelineReview | null }
  | { readonly target: 'constitution'; readonly constitutionPath: string | null };

export type BoardEntityDraftEdit =
  | BoardStepsDraftEdit
  | { readonly target: 'role'; readonly role: BoardEntityAgentRole; readonly value: BoardAgentStepSettings | null }
  | { readonly target: 'whitelist' | 'reach' | 'depends-on'; readonly value: readonly string[] | null }
  | { readonly target: 'concurrency'; readonly value: number | null };

/** One typed edit of the draft, as a refusal's fix carries it; a `null` value removes what it names. */
export type BoardDraftEdit =
  | BoardStepsDraftEdit
  | { readonly target: 'role'; readonly role: BoardPipelineAgentRole; readonly value: BoardAgentStepSettings | null }
  | { readonly target: 'airlock'; readonly value: BoardPipelineAirlock | null }
  | { readonly target: 'approval'; readonly approval: BoardPipelineApproval; readonly value: boolean | null }
  | { readonly target: 'entity'; readonly entityKey: string; readonly value: BoardPipelineEntityDefinition | null }
  | { readonly target: 'within-entity'; readonly entityKey: string; readonly edit: BoardEntityDraftEdit };

/** The one gesture that resolves a refusal; its label is the forge's. */
export interface BoardEntityRefusalFix {
  readonly label: string;
  readonly edits: readonly BoardDraftEdit[];
}

/** A refusal the draft's entities hold, which Continue and Apply wait on, shown on the row of `shownOn`. */
export interface BoardEntityRefusal {
  readonly reason:     BoardEntityRefusalReason;
  readonly entityKeys: readonly string[];
  readonly shownOn:    string;
  readonly sentence:   string;
  readonly fix:        BoardEntityRefusalFix | null;
}

export interface BoardPipelineSetup {
  readonly record:               BoardSetupRecord;
  readonly summary:              BoardSetupSummary;
  readonly openQuestionCount:    number;
  readonly agentJobState:        BoardJobState | null;
  readonly mainMovedByCommits:   number;
  readonly constitutionMarkdown: string | null;
  readonly constitutionOutline:  BoardConstitutionOutline | null;
  readonly annotations:          readonly BoardSourceAnnotation[];
  readonly readByRoles:          readonly BoardPipelineAgentRole[];
  readonly applyState:           BoardApplyState | null;
  /** `null` on a forge over no entities. */
  readonly entities:             Readonly<Record<string, BoardSetupEntityFacts>> | null;
  readonly draftEntities:        Readonly<Record<string, BoardDraftEntityFacts>>;
  /** The refusal an Apply of the current draft meets now, as the forge serves it; `null` when it would proceed. */
  readonly applyRefusal:         BoardRefusal | null;
  readonly entityRefusals:       readonly BoardEntityRefusal[];
}

export interface BoardResolvedInstruction {
  readonly entry:       BoardInstruction;
  readonly fileName:    string;
  readonly readByRoles: readonly BoardPipelineAgentRole[];
  readonly text:        string | null;
  readonly textIsCut:   boolean;
}

export interface BoardGateChip {
  readonly gateName: string;
  readonly mark:     BoardPipelineNodeMark;
}

export interface BoardFlowNode {
  readonly nodeId:             string;
  readonly nodeKind:           BoardPipelineNodeKind;
  readonly role:               BoardPipelineAgentRole | null;
  readonly settings:           BoardAgentPair | null;
  readonly instructionEntries: readonly BoardResolvedInstruction[];
  readonly derivedFrom:        BoardDerivedSettingsSource | null;
  readonly mergePlacement:     BoardMergePlacement | null;
  readonly phase:              BoardGatePhase | null;
  readonly conditional:        boolean;
  readonly thresholdLines:     number | null;
  readonly switchState:        BoardSwitchState | null;
  readonly gateChips:          readonly BoardGateChip[];
  readonly mark:               BoardPipelineNodeMark;
  readonly dialogTarget:       BoardNodeDialogTarget | null;
  readonly questionIds:        readonly string[];
}

export interface BoardFlowEdge {
  readonly from:      string;
  readonly to:        string;
  readonly tone:      BoardEdgeTone;
  readonly labelKind: BoardEdgeLabelKind | null;
  readonly active:    boolean;
}

export interface BoardInsertSlot {
  readonly slotId:       string;
  readonly after:        string;
  readonly offeredSteps: readonly BoardInsertableStep[];
}

export interface BoardFlowOccupant {
  readonly occupantKind: BoardOccupantKind;
  readonly occupantId:   string;
  readonly nodeId:       string;
  readonly jobId:        string | null;
  readonly since:        string;
}

export interface BoardGateRow {
  readonly rowKind:      BoardGateRowKind;
  readonly name:         string;
  readonly run:          string;
  readonly fix:          string | null;
  readonly runsIn:       string | null;
  readonly network:      readonly string[];
  readonly alsoInPhases: readonly BoardGatePhase[];
  readonly mark:         BoardPipelineNodeMark;
}

export type BoardGateRows = Readonly<Record<BoardGatePhase, readonly BoardGateRow[]>>;

export interface BoardPipelineChange {
  readonly field:      string;
  readonly changeKind: BoardChangeKind;
  readonly editId:     string | null;
}

export interface BoardEntityFlow {
  readonly nodes:       readonly BoardFlowNode[];
  readonly edges:       readonly BoardFlowEdge[];
  readonly insertSlots: readonly BoardInsertSlot[];
  readonly gateRows:    BoardGateRows;
}

export interface BoardPipelineFlow extends BoardEntityFlow {
  readonly occupants:         readonly BoardFlowOccupant[];
  readonly changeList:        readonly BoardPipelineChange[];
  readonly ticketIdsInFlight: readonly string[];
  readonly toolbarStage:      BoardFlowStage;
  /** `null` on a forge over no entities. */
  readonly entityFlows:       Readonly<Record<string, BoardEntityFlow>> | null;
}

export interface BoardGateProfileRun {
  readonly profileRunId:        string;
  readonly entity:              string | null;
  readonly gateName:            string;
  readonly phase:               BoardGatePhase;
  readonly state:               BoardProfileRunState;
  readonly elapsedMilliseconds: number | null;
  readonly cacheReport:         BoardCacheReport | null;
}

export interface BoardGateCacheMark {
  readonly entity:      string | null;
  readonly gateName:    string;
  readonly phase:       BoardGatePhase;
  readonly cacheReport: BoardCacheReport;
}

/** The newest run of one step line, in the measure of the line's bound: a sleep does not count. */
export interface BoardStepRunTime {
  readonly entity:          string | null;
  readonly stepKind:        BoardStepKind;
  readonly stepName:        string;
  /** `null` for an install step. */
  readonly phase:           BoardGatePhase | null;
  readonly runMilliseconds: number;
  readonly ending:          BoardStepEnding;
  readonly at:              string;
}

export type BoardPipelineHistoryEntry =
  | { readonly kind: 'pipeline-gate-added'; readonly at: string; readonly name: string; readonly run: string }
  | { readonly kind: 'pipeline-gate-removed'; readonly at: string; readonly name: string }
  | { readonly kind: 'pipeline-gates-none'; readonly at: string }
  | { readonly kind: 'pipeline-gates-ordered'; readonly at: string; readonly phase: BoardGatePhase; readonly names: readonly string[] }
  | { readonly kind: 'pipeline-prepare-step-set'; readonly at: string; readonly name: string; readonly run: string }
  | { readonly kind: 'pipeline-approval-set'; readonly at: string; readonly approval: string; readonly state: string }
  | {
    readonly kind:                       'pipeline-setup-opened';
    readonly at:                         string;
    readonly setupId:                    string;
    readonly mode:                       BoardSetupMode;
    readonly replacesUnreadablePipeline: boolean;
  }
  | { readonly kind: 'pipeline-draft-discarded'; readonly at: string; readonly setupId: string; readonly revision: number }
  | { readonly kind: 'pipeline-setup-discarded'; readonly at: string; readonly setupId: string }
  | { readonly kind: 'overseer-set'; readonly at: string; readonly state: BoardOverseerSetting };

export interface BoardPipelineChoices {
  readonly models:  readonly BoardAgentModel[];
  readonly efforts: readonly BoardAgentEffort[];
}

export interface BoardEntityAssignmentTicket {
  readonly ticketId:   string;
  readonly title:      string | null;
  readonly entity:     string | null;
  readonly reason:     string | null;
  readonly assignedBy: BoardAssignedBy | null;
}

export interface BoardEntityAssignment {
  readonly jobId:    string;
  readonly jobState: BoardJobState | null;
  readonly tickets:  readonly BoardEntityAssignmentTicket[];
}

/** Everything of a forge's board about its pipeline, in one place of the board. */
export interface BoardPipelineFacts {
  readonly applied:          BoardAppliedPipeline;
  readonly setup:            BoardPipelineSetup | null;
  readonly flow:             BoardPipelineFlow | null;
  readonly profileRuns:      readonly BoardGateProfileRun[];
  readonly gateCacheMarks:   readonly BoardGateCacheMark[];
  readonly stepRunTimes:     readonly BoardStepRunTime[];
  readonly history:          readonly BoardPipelineHistoryEntry[];
  readonly choices:          BoardPipelineChoices;
  readonly agentDefaults:    BoardAgentPair;
  readonly entityAssignment: BoardEntityAssignment | null;
}
