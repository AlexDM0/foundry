/** Why the Board refused a change: a reason code and the facts, never a sentence. The caller words it. */
import type { GatePhase }                                                  from './@types/GatePhase.ts';
import type { JobKind, JobMoveTarget, JobState }                           from './@types/Job.ts';
import type { NeedGap }                                                    from './@types/Need.ts';
import type { PipelineSetupMode, PipelineSetupStep, SourceAnnotationKind } from './@types/PipelineSetup.ts';
import type { TaskStatus }                                                 from './@types/Task.ts';
import type {
  IncompleteTicket,
  AgentPair,
  TicketPriority,
  TicketSize,
  TicketStatus,
  TicketType,
  RowedTicketStatus
} from './@types/Ticket.ts';
import type { EntityRefusalReason } from './utils/EntityValidationUtil.ts';
import type { OptionNotesProblem }  from './utils/OptionConsequencesUtil.ts';

/** A ticket whose Brief names files that neither its entity nor a package it whitelists owns, outside its `reach` (E85). */
export interface TicketWorkOutsideEntity {
  ticketId: string;
  entity:   string;
  paths:    readonly string[];
}

export type BoardRefusalDetail =
  | { reason: 'unknown-task'; taskId: number }
  | { reason: 'ticket-owned-row'; taskId: number; ticketId: string; targetStatus: Exclude<TaskStatus, 'paused'> }
  | { reason: 'ticket-already-has-row'; ticketId: string; taskId: number; taskName: string }
  | { reason: 'ticket-id-already-filed'; ticketId: string }
  | { reason: 'task-belongs-to-another-ticket'; taskId: number; owningTicketId: string; ticketId: string }
  | { reason: 'ticket-already-in-status'; ticketId: string; status: TicketStatus }
  | { reason: 'illegal-ticket-move'; ticketId: string; status: TicketStatus; targetStatus: RowedTicketStatus }
  | { reason: 'move-to-draft'; ticketId: string; status: TicketStatus }
  | { reason: 'move-of-a-draft'; ticketId: string; targetStatus: RowedTicketStatus }
  | { reason: 'move-to-ready-for-review'; ticketId: string; status: TicketStatus }
  | { reason: 'move-of-a-ticket-ready-for-review'; ticketId: string; targetStatus: RowedTicketStatus }
  | { reason: 'ready-of-a-ticket-not-in-draft'; ticketId: string; status: TicketStatus }
  | { reason: 'incomplete-tickets'; incompleteTickets: readonly IncompleteTicket[] }
  /** In a forge with entities: the tickets named to ready that have none. */
  | { reason: 'ticket-without-entity'; ticketIds: readonly string[] }
  | { reason: 'work-outside-entity'; ticketsOutside: readonly TicketWorkOutsideEntity[] }
  | { reason: 'abandon-without-reason'; ticketId: string }
  | { reason: 'tokens-without-a-row'; ticketId: string }
  | { reason: 'rereview-outside-review'; ticketId: string; status: TicketStatus }
  | { reason: 'review-record-without-a-review-bar'; ticketId: string }
  | { reason: 'review-bar-without-a-round'; ticketId: string; taskId: number }
  | { reason: 'review-record-on-a-row-that-is-not-a-review-bar'; ticketId: string; taskId: number }
  | { reason: 'review-record-on-a-bar-outside-the-bundle'; ticketId: string; taskId: number; reviewOf: string }
  | { reason: 'unclaimable-status'; ticketId: string; status: TicketStatus }
  | { reason: 'claim-waits-on-dependencies'; ticketId: string; unsettledTicketIds: readonly string[] }
  | { reason: 'claim-of-a-held-ticket'; ticketId: string }
  | { reason: 'claim-under-review'; ticketId: string; reviewBarTaskId: number }
  | { reason: 'claim-after-a-ticket-not-in-review'; ticketId: string; afterTicketId: string; status: TicketStatus }
  | { reason: 'claim-after-a-ticket-outside-the-bundle'; ticketId: string; afterTicketId: string }
  | { reason: 'claim-after-a-ticket-it-does-not-wait-on'; ticketId: string; afterTicketId: string }
  | { reason: 'concurrency-limit-reached'; ticketIds: readonly string[]; agentsInFlight: number; inProgressRowCount: number; limit: number }
  | { reason: 'unknown-dependency'; missingTicketIds: readonly string[] }
  | { reason: 'dependency-loop'; loopTicketIds: readonly string[] }
  | { reason: 'unknown-linked-ticket'; missingTicketId: string }
  | { reason: 'introduced-by-on-a-non-bug'; ticketId: string; type: TicketType }
  | { reason: 'introduced-by-itself'; ticketId: string }
  | { reason: 'introduced-by-an-undelivered-ticket'; ticketId: string; causeTicketId: string; status: TicketStatus }
  | { reason: 'priority-unchanged'; ticketId: string; status: TicketStatus; priority: TicketPriority }
  | { reason: 'size-unchanged'; ticketId: string; status: TicketStatus; size: TicketSize }
  | { reason: 'lowering-a-ticket-that-is-not-committed'; ticketId: string; status: TicketStatus }
  | { reason: 'content-of-a-committed-ticket'; ticketId: string; status: TicketStatus }
  | { reason: 'network-of-a-ticket-past-committed'; ticketId: string; status: TicketStatus }
  | { reason: 'network-domain-not-public'; ticketId: string; domains: readonly string[] }
  | { reason: 'network-unchanged'; ticketId: string; domains: readonly string[] }
  /** `entityKeys` is empty when the pipeline names no entity. */
  | { reason: 'unknown-entity'; ticketId: string; entity: string; entityKeys: readonly string[] }
  | { reason: 'entity-of-a-ticket-past-committed'; ticketId: string; status: TicketStatus }
  | { reason: 'entity-unchanged'; ticketId: string; entity: string }
  | { reason: 'entity-without-reason'; ticketId: string }
  /** A need declared by a job that is not a build job of an entity, as every job of a forge without entities. */
  | { reason: 'need-outside-an-entity-build'; jobId: string }
  /** `entityKeys` is empty when the pipeline names no entity. */
  | { reason: 'need-entity-unknown'; jobId: string; entity: string; entityKeys: readonly string[] }
  | { reason: 'need-of-own-entity'; jobId: string; entity: string }
  | { reason: 'need-incomplete'; jobId: string; gaps: readonly NeedGap[] }
  | { reason: 'need-limit-reached'; jobId: string; limit: number }
  | { reason: 'agents-of-a-settled-ticket'; ticketId: string; status: TicketStatus }
  | { reason: 'agents-unchanged'; ticketId: string; status: TicketStatus; agents: AgentPair }
  | { reason: 'hold-of-a-settled-ticket'; ticketId: string; status: TicketStatus; action: 'hold' | 'unhold' }
  | { reason: 'ticket-already-held'; ticketId: string }
  | { reason: 'ticket-not-held'; ticketId: string }
  | { reason: 'ticket-not-interrupted'; ticketId: string }
  | { reason: 'release-mark-of-a-settled-ticket'; ticketId: string; status: TicketStatus; action: 'mark' | 'clear' }
  | { reason: 'release-mark-of-an-ungrouped-ticket'; ticketId: string }
  | { reason: 'group-already-has-a-release-ticket'; ticketId: string; group: string; releaseTicketId: string }
  | { reason: 'ticket-is-not-a-release-ticket'; ticketId: string }
  | { reason: 'reopen-beside-an-open-release-ticket'; ticketId: string; status: TicketStatus; targetStatus: TicketStatus; group: string; releaseTicketId: string }
  | { reason: 'malformed-epic-key'; epicKey: string }
  | { reason: 'malformed-group-name'; group: string }
  | { reason: 'group-name-case-twin'; group: string; existingGroup: string }
  | { reason: 'group-of-a-settled-ticket'; ticketId: string; status: TicketStatus }
  | { reason: 'ticket-already-in-a-group'; ticketId: string; group: string }
  | { reason: 'epic-already-exists'; epicKey: string }
  | { reason: 'unknown-epic'; missingEpicKeys: readonly string[] }
  | { reason: 'epic-still-named'; epicKey: string; ticketIds: readonly string[] }
  | { reason: 'unknown-gate'; gateName: string; gateNames: readonly string[] }
  | { reason: 'gate-without-phase'; gateName: string }
  | { reason: 'unknown-gate-phase'; phase: string; phases: readonly GatePhase[] }
  | { reason: 'phase-order-not-a-reorder'; phase: GatePhase; names: readonly string[]; phaseGateNames: readonly string[] }
  | { reason: 'approval-without-pipeline'; approval: string }
  | { reason: 'reach-without-pipeline' }
  /** A `gate` write of the forge's own steps, gates or reach while each entity of `entityKeys` holds its own. */
  | { reason: 'pipeline-set-per-entity'; entityKeys: readonly string[] }
  | { reason: 'setup-in-progress'; setupId: string }
  | { reason: 'no-setup-open'; setupId: string }
  | { reason: 'pipeline-setup-unreadable'; problem: string }
  | { reason: 'no-pipeline-to-update'; mode: PipelineSetupMode }
  | { reason: 'pipeline-apply-pending'; setupId: string }
  | { reason: 'no-apply-pending'; setupId: string }
  | { reason: 'pipeline-check-running'; setupId: string }
  | { reason: 'no-gate-to-check'; setupId: string }
  /** A pipeline-agent level named by an entity the pipeline it reads does not hold; `entityKeys` is empty when it holds none. */
  | { reason: 'setup-entity-unknown'; entity: string; entityKeys: readonly string[] }
  | { reason: 'setup-question-open'; setupId: string; questionIds: readonly string[] }
  | { reason: 'setup-step-needs-recheck'; setupId: string; steps: readonly PipelineSetupStep[] }
  /** Continue and Apply wait while the draft's entities hold any refusal of the entity validator. */
  | { reason: 'entity-refusals-stand'; setupId: string; reasons: readonly EntityRefusalReason[] }
  | { reason: 'setup-snapshot-touched'; setupId: string }
  | { reason: 'pipeline-moved'; setupId: string; baseContentHash: string | null; contentHash: string | null }
  /** `entity` names the entity whose constitution file moved; absent for the forge's own `CONSTITUTION.md`. */
  | { reason: 'constitution-moved'; setupId: string; baseBlob: string | null; mainBlob: string | null; entity?: string }
  /** E91: the draft removes or renames an entity that tickets not yet delivered or abandoned name. */
  | { reason: 'entity-named-by-tickets'; setupId: string; entity: string; ticketIds: readonly string[] }
  /** E94: the draft turns a stored pipeline without entities into entities while these tickets are in progress, in review or reviewed. */
  | { reason: 'entities-while-tickets-in-flight'; setupId: string; ticketIds: readonly string[] }
  | { reason: 'billing-cap-not-positive'; maxBudgetUsd: number }
  | { reason: 'setup-step-not-current'; setupId: string; step: PipelineSetupStep; currentStep: PipelineSetupStep }
  | { reason: 'setup-step-not-reached'; setupId: string; step: PipelineSetupStep }
  | { reason: 'setup-step-not-continued'; setupId: string; step: PipelineSetupStep }
  | { reason: 'unknown-setup-question'; setupId: string; questionId: string }
  | { reason: 'empty-setup-answer'; setupId: string; questionId: string }
  | { reason: 'setup-question-option-count'; optionCount: number; minimum: number; maximum: number }
  | { reason: 'setup-question-without-recommendation' }
  | { reason: 'unknown-setup-option-letters'; unknownLetters: readonly string[]; optionLetters: readonly string[] }
  | { reason: 'several-letters-on-single-select-setup-question'; letters: readonly string[] }
  | { reason: 'constitution-empty' }
  | { reason: 'constitution-too-long'; characterCount: number; limit: number }
  | { reason: 'constitution-source-unanchored'; lineText: string; occurrence: number }
  | { reason: 'constitution-source-repeated'; lineText: string; occurrence: number }
  | { reason: 'constitution-source-not-ticked'; lineText: string; occurrence: number; kind: SourceAnnotationKind }
  | { reason: 'constitution-draft-stale'; setupId: string; revision: number; currentRevision: number }
  | { reason: 'pipeline-draft-stale'; setupId: string; revision: number; currentRevision: number }
  | { reason: 'no-draft-edits'; setupId: string }
  | { reason: 'draft-edit-name-mismatch'; field: string; name: string }
  | { reason: 'prepare-order-not-a-reorder'; names: readonly string[]; prepareNames: readonly string[] }
  | { reason: 'unknown-setup-edit'; setupId: string; editId: string }
  | { reason: 'setup-edit-already-undone'; setupId: string; editId: string }
  | { reason: 'gate-profiles-unreadable'; problem: string }
  | { reason: 'gate-profile-running'; gateName: string; phase: GatePhase; profileRunId: string }
  | { reason: 'unknown-profile-run'; profileRunId: string }
  | { reason: 'unknown-draft'; draftId: string }
  | { reason: 'draft-claimed-by-another-owner'; draftId: string; owner: string }
  | { reason: 'draft-closed-into-unknown-tickets'; draftId: string; missingTicketReferences: readonly string[] }
  | { reason: 'draft-has-open-questions'; draftId: string; openQuestionIds: readonly string[] }
  | { reason: 'unknown-draft-question'; draftId: string; questionId: string }
  | { reason: 'unknown-draft-item'; draftId: string; itemId: string }
  | { reason: 'draft-question-option-count'; draftId: string; optionCount: number; minimum: number; maximum: number }
  | { reason: 'draft-question-without-recommendation'; draftId: string }
  | { reason: 'unknown-draft-option-letters'; draftId: string; unknownLetters: readonly string[]; optionLetters: readonly string[] }
  | { reason: 'several-letters-on-single-select-question'; draftId: string; letters: readonly string[] }
  | { reason: 'unknown-job'; jobId: string }
  | { reason: 'job-finished'; jobId: string }
  | { reason: 'job-not-interrupted'; jobId: string }
  | { reason: 'job-has-no-ticket'; jobId: string }
  | { reason: 'job-not-intake'; jobId: string; kind: JobKind }
  | { reason: 'intake-title-empty'; jobId: string }
  | { reason: 'question-options-malformed'; jobId: string; field: string; problem: OptionNotesProblem }
  | { reason: 'intake-empty' }
  | { reason: 'pictures-not-taken'; jobId: string; kind: JobKind }
  | { reason: 'job-move-illegal'; jobId: string; state: JobState; targetState: JobMoveTarget }
  | { reason: 'merge-queue-of-a-ticket-not-in-review'; ticketId: string; status: TicketStatus }
  | { reason: 'merge-queue-without-a-current-green'; ticketId: string; headTree: string | null }
  | { reason: 'merge-approval-off'; ticketId: string }
  | { reason: 'merge-accept-of-a-ticket-not-waiting'; ticketId: string; status: TicketStatus }
  | { reason: 'merge-accept-would-conflict'; ticketId: string; target: string; conflictedFiles: readonly string[] }
  | { reason: 'merge-accept-prediction-failed'; ticketId: string; target: string; gitReason: string }
  | { reason: 'merge-update-of-a-ticket-not-waiting'; ticketId: string; status: TicketStatus }
  | { reason: 'merge-update-failed'; ticketId: string; target: string; gitReason: string }
  | { reason: 'airlock-held'; target: string; jobId: string }
  | { reason: 'merge-candidate-not-queued'; ticketId: string; target: string }
  | { reason: 'higher-priority-queued'; ticketId: string; queuedTicketIds: readonly string[] }
  | { reason: 'refresh-beside-a-queued-release'; group: string; releaseTicketId: string }
  | { reason: 'unknown-decision'; decisionId: string }
  | { reason: 'decision-already-answered'; decisionId: string }
  | { reason: 'decision-answer-count'; decisionId: string; answerCount: number; questionCount: number }
  | { reason: 'decision-without-questions' }
  | { reason: 'decision-questions-repeat'; question: string }
  | { reason: 'decision-has-several-questions'; decisionId: string; questionCount: number }
  | { reason: 'decision-option-unknown'; decisionId: string; questionNumber: number; choice: string; optionCount: number }
  | { reason: 'decision-single-choice'; decisionId: string; questionNumber: number; choice: string }
  | { reason: 'unknown-incident'; incidentId: string }
  | { reason: 'incident-closed'; incidentId: string }
  | { reason: 'incident-not-a-question'; incidentId: string; kind: string }
  | { reason: 'job-awaits-user-answer'; jobId: string }
  | { reason: 'job-is-product-owner'; jobId: string }
  | { reason: 'no-open-incident'; subject: string; move: string }
  | { reason: 'several-open-incidents'; subject: string; move: string; incidentIds: readonly string[] }
  | { reason: 'worktree-in-use'; ticketId: string; jobIds: readonly string[] }
  | { reason: 'worktree-has-uncommitted-work'; ticketId: string; worktreePath: string }
  | { reason: 'worktree-repair-failed'; ticketId: string; step: string; gitReason: string };

export class BoardRefusal extends Error {
  readonly detail: BoardRefusalDetail;

  constructor(detail: BoardRefusalDetail) {
    super(detail.reason);
    // Extending a built-in leaves `name` as `Error`, and the name is what an unhandled stack trace shows.
    this.name = 'BoardRefusal';
    this.detail = detail;
  }
}

export function refusalIsBoardRefusal(error: unknown): error is BoardRefusal {
  return error instanceof BoardRefusal;
}
