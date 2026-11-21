/**
 * A forge's pipeline facts as the page reads them: the stored pipeline as read with each entity's effective pipeline, the open setup record with
 * its entities draft, the entity refusals and the Apply refusal the forge serves, the flow a view draws, the gates' profile runs, cache
 * marks and step run times, the pipeline history, and the choices a step may take. Values only: the forge words only its refusals and the
 * label of a refusal's fix.
 */
import type { BoardForgeRefusalDocument }                                from './BoardRelayDocuments.ts';
import type { BoardQuestionAnswerDocument, BoardQuestionOptionDocument } from './BoardTicketDocuments.ts';
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
  BoardHephaestusSetting,
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

export interface BoardAgentPairDocument {
  readonly model:  BoardAgentModel;
  readonly effort: BoardAgentEffort;
}

export interface BoardPipelineStepDocument {
  readonly name:   string;
  readonly run:    string;
  /** The folder the step runs in; `null` runs it in the project's folder. */
  readonly runsIn: string | null;
}

export interface BoardPipelineGateDocument {
  readonly name:    string;
  readonly run:     string;
  readonly fix:     string | null;
  readonly runsIn:  string | null;
  readonly network: readonly string[];
  readonly writes:  readonly string[];
}

export type BoardPhaseOrdersDocument = Readonly<Record<BoardGatePhase, readonly string[]>>;

export type BoardInstructionDocument =
  | { readonly kind: 'constitution' }
  | { readonly kind: 'default-brief'; readonly role: BoardPipelineAgentRole }
  | { readonly kind: 'file'; readonly path: string };

/** `null` where the pipeline names none, which the role's default fills. */
export interface BoardAgentStepSettingsDocument {
  readonly model:        BoardAgentModel | null;
  readonly effort:       BoardAgentEffort | null;
  readonly instructions: readonly BoardInstructionDocument[] | null;
}

export interface BoardConditionalReReviewDocument {
  readonly thresholdLines: number;
}

export interface BoardPipelineReviewDocument {
  readonly name:     string;
  readonly reReview: BoardConditionalReReviewDocument | null;
}

export interface BoardPipelineAirlockDocument {
  readonly reReview: BoardConditionalReReviewDocument | null;
}

export type BoardBillingDocument =
  | { readonly mode: 'subscription' }
  | { readonly mode: 'api'; readonly maximumBudgetDollars: number | null };

export interface BoardPipelineEntityDocument {
  readonly kind:             BoardEntityKind;
  readonly home:             readonly string[];
  readonly summary:          string | null;
  /** `null`: the installed default constitution. */
  readonly constitutionPath: string | null;
  readonly prepare:          readonly BoardPipelineStepDocument[];
  readonly gates:            readonly BoardPipelineGateDocument[];
  readonly phases:           BoardPhaseOrdersDocument;
  readonly review:           BoardPipelineReviewDocument | null;
  readonly agents:           Readonly<Partial<Record<BoardEntityAgentRole, BoardAgentStepSettingsDocument>>>;
  readonly whitelist:        readonly string[];
  readonly reach:            readonly string[];
  readonly dependsOn:        readonly string[];
  readonly concurrency:      number | null;
}

/** A pipeline as the forge holds it; the forge's rules for what it leaves out stay the forge's, so absent stays absent here. */
export interface BoardPipelineDefinitionDocument {
  readonly version:          number;
  readonly prepare:          readonly BoardPipelineStepDocument[];
  readonly gates:            readonly BoardPipelineGateDocument[];
  readonly phases:           BoardPhaseOrdersDocument;
  readonly review:           BoardPipelineReviewDocument | null;
  readonly airlock:          BoardPipelineAirlockDocument | null;
  readonly constitutionPath: string | null;
  readonly agents:           Readonly<Partial<Record<BoardPipelineAgentRole, BoardAgentStepSettingsDocument>>>;
  readonly approvals:        Readonly<Partial<Record<BoardPipelineApproval, boolean>>>;
  readonly billing:          BoardBillingDocument | null;
  readonly reach:            readonly string[];
  /** `null` for a forge over no entities. */
  readonly entities:         Readonly<Record<string, BoardPipelineEntityDocument>> | null;
}

export interface BoardPipelineApplicationDocument {
  readonly appliedRevision:    number;
  readonly appliedAt:          string;
  readonly constitutionCommit: string | null;
}

export type BoardAppliedPipelineDocument =
  | { readonly readingVerdict: 'absent' }
  | { readonly readingVerdict: 'older'; readonly fileText: string }
  | { readonly readingVerdict: 'malformed'; readonly reason: string; readonly fileText: string }
  | {
    readonly readingVerdict:  'readable';
    readonly pipeline:        BoardPipelineDefinitionDocument;
    readonly contentHash:     string;
    readonly fileText:        string;
    readonly application:     BoardPipelineApplicationDocument | null;
    /** Each entity's pipeline as it runs, as the forge joined it; empty without entities. */
    readonly entityPipelines: Readonly<Record<string, BoardPipelineDefinitionDocument>>;
  };

export type BoardSetupStepStatesDocument = Readonly<Record<Exclude<BoardSetupStep, 'entities'>, BoardSetupStepState>> & {
  /** `null` until the record walks the step. */
  readonly entities: BoardSetupStepState | null;
};

export interface BoardResearchScriptDocument {
  readonly name:          string;
  readonly run:           string;
  readonly meaning:       string;
  readonly gateCandidate: BoardGateCandidacy;
  readonly needs:         readonly string[];
}

export interface BoardResearchFindingDocument {
  readonly findingId:    string;
  readonly topic:        BoardFindingTopic;
  readonly label:        string;
  readonly value:        string | null;
  readonly sourcePaths:  readonly string[];
  readonly script:       BoardResearchScriptDocument | null;
  readonly needsRecheck: boolean;
}

export interface BoardSetupQuestionSubjectDocument {
  readonly kind:      BoardSetupQuestionSubjectKind;
  readonly reference: string;
}

export interface BoardSetupQuestionDocument {
  readonly questionId:  string;
  readonly step:        BoardSetupQuestionStep;
  readonly subject:     BoardSetupQuestionSubjectDocument | null;
  readonly question:    string;
  readonly context:     string;
  readonly options:     readonly BoardQuestionOptionDocument[];
  readonly recommended: readonly string[];
  readonly multiple:    boolean;
  readonly answer:      BoardQuestionAnswerDocument | null;
}

export interface BoardSourceAnnotationDocument {
  readonly lineText:   string;
  readonly occurrence: number;
  readonly kind:       BoardSourceAnnotationKind;
  readonly path:       string | null;
}

export interface BoardConstitutionSourcesDocument {
  readonly contributing:     boolean;
  readonly research:         boolean;
  readonly installedDefault: boolean;
}

export interface BoardConstitutionDraftDocument {
  readonly markdown:    string;
  readonly annotations: readonly BoardSourceAnnotationDocument[];
  readonly draftedFrom: BoardConstitutionSourcesDocument;
  readonly revision:    number;
}

export interface BoardSetupEditDocument {
  readonly editId:  string;
  readonly by:      BoardEditAuthor;
  /** The draft field the forge names, such as `gate:unit` or `entity:web/reach`. */
  readonly field:   string;
  readonly summary: string;
  readonly undone:  boolean;
  readonly batch:   string | null;
}

export interface BoardCheckedGateDocument {
  readonly name:    string;
  readonly verdict: BoardCheckedGateVerdict;
  readonly output:  string;
}

export interface BoardCheckResultDocument {
  readonly snapshotCommit:     string;
  readonly prepareFailedSteps: readonly (string | null)[];
  readonly prepareOutput:      string;
  readonly gates:              readonly BoardCheckedGateDocument[];
}

export interface BoardPipelineCheckDocument {
  readonly draftRevision: number;
  readonly gateNames:     readonly string[];
  readonly state:         BoardCheckState;
  readonly result:        BoardCheckResultDocument | null;
  readonly reason:        string | null;
}

export interface BoardSetupEntityDocument {
  readonly agentJobId:   string | null;
  readonly findings:     readonly BoardResearchFindingDocument[];
  readonly questions:    readonly BoardSetupQuestionDocument[];
  readonly constitution: BoardConstitutionDraftDocument | null;
  readonly check:        BoardPipelineCheckDocument | null;
}

export interface BoardSetupRecordDocument {
  readonly setupId:                    string;
  readonly mode:                       BoardSetupMode;
  readonly stepStates:                 BoardSetupStepStatesDocument;
  readonly currentStep:                BoardSetupStep;
  readonly billing:                    BoardBillingDocument;
  readonly agentJobId:                 string | null;
  readonly snapshotCommit:             string | null;
  readonly readyToContinue:            readonly BoardSetupStep[];
  readonly findings:                   readonly BoardResearchFindingDocument[];
  readonly questions:                  readonly BoardSetupQuestionDocument[];
  readonly constitution:               BoardConstitutionDraftDocument | null;
  readonly draft:                      BoardPipelineDefinitionDocument | null;
  readonly draftRevision:              number;
  readonly edits:                      readonly BoardSetupEditDocument[];
  readonly replacesUnreadablePipeline: boolean;
  readonly check:                      BoardPipelineCheckDocument | null;
  /** `null` on a forge over no entities. */
  readonly entities:                   Readonly<Record<string, BoardSetupEntityDocument>> | null;
}

export interface BoardSetupEntitySummaryDocument {
  readonly stackItemCount:                number;
  readonly scriptCount:                   number;
  readonly answeredResearchQuestionCount: number;
  readonly prepareStepCount:              number;
  readonly gateCountByPhase:              Readonly<Record<BoardGatePhase, number>>;
}

export interface BoardSetupSummaryDocument extends BoardSetupEntitySummaryDocument {
  readonly userEditsKeptCount: number;
}

export interface BoardConstitutionOutlineDocument {
  readonly sectionCount: number;
  readonly ruleCount:    number;
}

export interface BoardApplyStateDocument {
  readonly draftRevision:       number;
  readonly resumesBoard:        boolean;
  readonly state:               BoardApplyRequestState;
  readonly reason:              BoardApplyRequestReason | null;
  readonly blockingFiles:       readonly string[];
  readonly ticketIdHoldingMain: string | null;
}

export interface BoardSetupEntityFactsDocument {
  readonly summary:             BoardSetupEntitySummaryDocument;
  readonly openQuestionCount:   number;
  readonly agentJobState:       BoardJobState | null;
  readonly constitutionHtml:    string | null;
  readonly constitutionOutline: BoardConstitutionOutlineDocument | null;
  readonly annotations:         readonly BoardSourceAnnotationDocument[];
  readonly readByRoles:         readonly BoardEntityAgentRole[];
}

/** What a view shows of one entity of the draft: its pipeline as it would run, and every entity that consumes it. */
export interface BoardDraftEntityFactsDocument {
  readonly effectivePipeline:   BoardPipelineDefinitionDocument;
  readonly dependentEntityKeys: readonly string[];
}

export interface BoardPipelineEntityDefinitionDocument {
  readonly kind:    BoardEntityKind;
  readonly home:    readonly string[];
  readonly summary: string | null;
}

export type BoardStepsDraftEditDocument =
  | { readonly target: 'gate'; readonly name: string; readonly value: BoardPipelineGateDocument | null }
  | { readonly target: 'phase-order'; readonly phase: BoardGatePhase; readonly names: readonly string[] }
  | { readonly target: 'prepare'; readonly name: string; readonly value: BoardPipelineStepDocument | null }
  | { readonly target: 'prepare-order'; readonly names: readonly string[] }
  | { readonly target: 'review'; readonly value: BoardPipelineReviewDocument | null }
  | { readonly target: 'constitution'; readonly constitutionPath: string | null };

export type BoardEntityDraftEditDocument =
  | BoardStepsDraftEditDocument
  | { readonly target: 'role'; readonly role: BoardEntityAgentRole; readonly value: BoardAgentStepSettingsDocument | null }
  | { readonly target: 'whitelist' | 'reach' | 'depends-on'; readonly value: readonly string[] | null }
  | { readonly target: 'concurrency'; readonly value: number | null };

/** One typed edit of the draft, as a refusal's fix carries it; a `null` value removes what it names. */
export type BoardDraftEditDocument =
  | BoardStepsDraftEditDocument
  | { readonly target: 'role'; readonly role: BoardPipelineAgentRole; readonly value: BoardAgentStepSettingsDocument | null }
  | { readonly target: 'airlock'; readonly value: BoardPipelineAirlockDocument | null }
  | { readonly target: 'approval'; readonly approval: BoardPipelineApproval; readonly value: boolean | null }
  | { readonly target: 'entity'; readonly entityKey: string; readonly value: BoardPipelineEntityDefinitionDocument | null }
  | { readonly target: 'within-entity'; readonly entityKey: string; readonly edit: BoardEntityDraftEditDocument };

/** The one gesture that resolves a refusal; its label is the forge's. */
export interface BoardEntityRefusalFixDocument {
  readonly label: string;
  readonly edits: readonly BoardDraftEditDocument[];
}

/** A refusal the draft's entities hold, which Continue and Apply wait on, shown on the row of `shownOn`. */
export interface BoardEntityRefusalDocument {
  readonly reason:     BoardEntityRefusalReason;
  readonly entityKeys: readonly string[];
  readonly shownOn:    string;
  /** The forge's sentence, unchanged. */
  readonly text:       string;
  readonly fix:        BoardEntityRefusalFixDocument | null;
}

export interface BoardPipelineSetupDocument {
  readonly record:              BoardSetupRecordDocument;
  readonly summary:             BoardSetupSummaryDocument;
  readonly openQuestionCount:   number;
  readonly agentJobState:       BoardJobState | null;
  readonly mainMovedByCommits:  number;
  readonly constitutionHtml:    string | null;
  readonly constitutionOutline: BoardConstitutionOutlineDocument | null;
  readonly annotations:         readonly BoardSourceAnnotationDocument[];
  readonly readByRoles:         readonly BoardPipelineAgentRole[];
  readonly applyState:          BoardApplyStateDocument | null;
  /** `null` on a forge over no entities. */
  readonly entities:            Readonly<Record<string, BoardSetupEntityFactsDocument>> | null;
  readonly draftEntities:       Readonly<Record<string, BoardDraftEntityFactsDocument>>;
  /** The refusal an Apply of the current draft meets now, as the forge serves it; `null` when it would proceed. */
  readonly applyRefusal:        BoardForgeRefusalDocument | null;
  readonly entityRefusals:      readonly BoardEntityRefusalDocument[];
}

export interface BoardResolvedInstructionDocument {
  readonly entry:       BoardInstructionDocument;
  readonly fileName:    string;
  readonly readByRoles: readonly BoardPipelineAgentRole[];
  readonly text:        string | null;
  readonly textIsCut:   boolean;
}

export interface BoardGateChipDocument {
  readonly gateName: string;
  readonly mark:     BoardPipelineNodeMark;
}

export interface BoardFlowNodeDocument {
  readonly nodeId:             string;
  readonly nodeKind:           BoardPipelineNodeKind;
  readonly role:               BoardPipelineAgentRole | null;
  readonly settings:           BoardAgentPairDocument | null;
  readonly instructionEntries: readonly BoardResolvedInstructionDocument[];
  readonly derivedFrom:        BoardDerivedSettingsSource | null;
  readonly mergePlacement:     BoardMergePlacement | null;
  readonly phase:              BoardGatePhase | null;
  readonly conditional:        boolean;
  readonly thresholdLines:     number | null;
  readonly switchState:        BoardSwitchState | null;
  readonly gateChips:          readonly BoardGateChipDocument[];
  readonly mark:               BoardPipelineNodeMark;
  readonly dialogTarget:       BoardNodeDialogTarget | null;
  readonly questionIds:        readonly string[];
}

export interface BoardFlowEdgeDocument {
  readonly from:      string;
  readonly to:        string;
  readonly tone:      BoardEdgeTone;
  readonly labelKind: BoardEdgeLabelKind | null;
  readonly active:    boolean;
}

export interface BoardInsertSlotDocument {
  readonly slotId:       string;
  readonly after:        string;
  readonly offeredSteps: readonly BoardInsertableStep[];
}

export interface BoardFlowOccupantDocument {
  readonly occupantKind: BoardOccupantKind;
  readonly occupantId:   string;
  readonly nodeId:       string;
  readonly jobId:        string | null;
  readonly since:        string;
}

export interface BoardGateRowDocument {
  readonly rowKind:      BoardGateRowKind;
  readonly name:         string;
  readonly run:          string;
  readonly fix:          string | null;
  readonly runsIn:       string | null;
  readonly network:      readonly string[];
  readonly alsoInPhases: readonly BoardGatePhase[];
  readonly mark:         BoardPipelineNodeMark;
}

export type BoardGateRowsDocument = Readonly<Record<BoardGatePhase, readonly BoardGateRowDocument[]>>;

export interface BoardPipelineChangeDocument {
  readonly field:      string;
  readonly changeKind: BoardChangeKind;
  readonly editId:     string | null;
}

export interface BoardEntityFlowDocument {
  readonly nodes:       readonly BoardFlowNodeDocument[];
  readonly edges:       readonly BoardFlowEdgeDocument[];
  readonly insertSlots: readonly BoardInsertSlotDocument[];
  readonly gateRows:    BoardGateRowsDocument;
}

export interface BoardPipelineFlowDocument extends BoardEntityFlowDocument {
  readonly occupants:         readonly BoardFlowOccupantDocument[];
  readonly changeList:        readonly BoardPipelineChangeDocument[];
  readonly ticketIdsInFlight: readonly string[];
  readonly toolbarStage:      BoardFlowStage;
  /** `null` on a forge over no entities. */
  readonly entityFlows:       Readonly<Record<string, BoardEntityFlowDocument>> | null;
}

export interface BoardGateProfileRunDocument {
  readonly profileRunId:        string;
  readonly entity:              string | null;
  readonly gateName:            string;
  readonly phase:               BoardGatePhase;
  readonly state:               BoardProfileRunState;
  readonly elapsedMilliseconds: number | null;
  readonly cacheReport:         BoardCacheReport | null;
}

export interface BoardGateCacheMarkDocument {
  readonly entity:      string | null;
  readonly gateName:    string;
  readonly phase:       BoardGatePhase;
  readonly cacheReport: BoardCacheReport;
}

/** The newest run of one step line, in the measure of the line's bound: a sleep does not count. */
export interface BoardStepRunTimeDocument {
  readonly entity:          string | null;
  readonly stepKind:        BoardStepKind;
  readonly stepName:        string;
  /** `null` for an install step. */
  readonly phase:           BoardGatePhase | null;
  readonly runMilliseconds: number;
  readonly ending:          BoardStepEnding;
  readonly at:              string;
}

export type BoardPipelineHistoryEntryDocument =
  | { readonly kind: 'pipeline-gate-added'; readonly at: string; readonly name: string; readonly run: string }
  | { readonly kind: 'pipeline-gate-removed'; readonly at: string; readonly name: string }
  | { readonly kind: 'pipeline-gates-none'; readonly at: string }
  | { readonly kind: 'pipeline-gates-ordered'; readonly at: string; readonly phase: BoardGatePhase; readonly names: readonly string[] }
  | { readonly kind: 'pipeline-prepare-step-set'; readonly at: string; readonly name: string; readonly run: string }
  | { readonly kind: 'pipeline-approval-set'; readonly at: string; readonly approval: string; readonly state: string }
  /** The Assistant's switch; `state` is `on` or `off`. */
  | { readonly kind: 'pipeline-assistant-set'; readonly at: string; readonly state: string }
  | {
    readonly kind:                       'pipeline-setup-opened';
    readonly at:                         string;
    readonly setupId:                    string;
    readonly mode:                       BoardSetupMode;
    readonly replacesUnreadablePipeline: boolean;
  }
  | { readonly kind: 'pipeline-draft-discarded'; readonly at: string; readonly setupId: string; readonly revision: number }
  | { readonly kind: 'pipeline-setup-discarded'; readonly at: string; readonly setupId: string }
  | { readonly kind: 'hephaestus-set'; readonly at: string; readonly state: BoardHephaestusSetting };

export interface BoardPipelineChoicesDocument {
  readonly models:  readonly BoardAgentModel[];
  readonly efforts: readonly BoardAgentEffort[];
}

export interface BoardEntityAssignmentTicketDocument {
  readonly ticketId:   string;
  readonly title:      string | null;
  readonly entity:     string | null;
  readonly reason:     string | null;
  readonly assignedBy: BoardAssignedBy | null;
}

export interface BoardEntityAssignmentDocument {
  readonly jobId:    string;
  readonly jobState: BoardJobState | null;
  readonly tickets:  readonly BoardEntityAssignmentTicketDocument[];
}

/** Everything of a forge's board about its pipeline, in one place of the board. */
export interface BoardPipelineFactsDocument {
  readonly applied:          BoardAppliedPipelineDocument;
  readonly setup:            BoardPipelineSetupDocument | null;
  readonly flow:             BoardPipelineFlowDocument | null;
  readonly profileRuns:      readonly BoardGateProfileRunDocument[];
  readonly gateCacheMarks:   readonly BoardGateCacheMarkDocument[];
  readonly stepRunTimes:     readonly BoardStepRunTimeDocument[];
  readonly history:          readonly BoardPipelineHistoryEntryDocument[];
  readonly choices:          BoardPipelineChoicesDocument;
  readonly agentDefaults:    BoardAgentPairDocument;
  readonly entityAssignment: BoardEntityAssignmentDocument | null;
}
