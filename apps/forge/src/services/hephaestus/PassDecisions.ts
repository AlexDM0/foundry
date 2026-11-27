/** The decisions Hephaestus asks itself in a pass: a leftover worktree, and an API key its billing misses. */
import type { Board }            from '../../domain/tracker-model/Board.ts';
import { AgentBillingUtil }      from '../../lib/agent-launch/utils/AgentBillingUtil.ts';
import type { BoardTransaction } from '../tracker/BoardTransaction.ts';
import type { DrivePassRequest } from './@types/DrivePassRequest.ts';

const API_KEY_DECISION_DRAFT = { kind: 'api-key-not-set', ticketIds: [], jobId: null } as const;

const API_KEY_DECISION_WITHDRAWN_REASON = 'Hephaestus no longer misses the API key';

/** One decision per folder, its context the folder itself, so a restart finding the same folder opens no second one. */
function openLeftoverWorktreeDecisions(change: BoardTransaction, decisionWordingOf: DrivePassRequest['decisionWordingOf'], folders: readonly string[]): void {
  const draft = { kind: 'leftover-worktree', ticketIds: [], jobId: null } as const;
  for (const folder of folders) {
    if (change.board.decisions().some((decision) => decision.kind === draft.kind && decision.context === folder)) continue;
    change.board.openDecision({
      ...draft, askedBy: 'hephaestus', requestId: null, questions: decisionWordingOf(draft).questions, context: folder
    }, change.at);
  }
}

/** One decision while any is open, however many jobs wait on the key. */
function openApiKeyDecisionOnce(board: Board, decisionWordingOf: DrivePassRequest['decisionWordingOf'], at: string): void {
  if (board.decisions().some((decision) => decision.kind === API_KEY_DECISION_DRAFT.kind)) return;
  board.openDecision({
    ...API_KEY_DECISION_DRAFT, askedBy: 'hephaestus', requestId: null, ...decisionWordingOf(API_KEY_DECISION_DRAFT)
  }, at);
}

function openApiKeyDecisionIdsOf(board: Board): string[] {
  return board.decisions().filter((decision) => decision.kind === API_KEY_DECISION_DRAFT.kind).map((decision) => decision.id);
}

/** The stored pipeline's billing, or the open setup record's, which bills its pipeline agent before any pipeline is stored, needs a key not set. */
function aBillingMissesItsKey(request: DrivePassRequest, board: Board): boolean {
  const billings = [board.pipeline()?.billing, board.pipelineSetup()?.billing ?? undefined];
  return billings.some((billing) => AgentBillingUtil.launchReadinessOf(request.agentAdapter.billingOptions, billing, request.agentVariableIsSet).verdict === 'key-missing');
}

/** The key is set, or the billing no longer needs one: the open decision asks User for nothing. */
function withdrawApiKeyDecisions(board: Board, at: string): void {
  for (const decisionId of openApiKeyDecisionIdsOf(board)) board.withdrawDecision(decisionId, API_KEY_DECISION_WITHDRAWN_REASON, at);
}

export const PassDecisions = Object.freeze({
  openLeftoverWorktreeDecisions,
  openApiKeyDecisionOnce,
  openApiKeyDecisionIdsOf,
  aBillingMissesItsKey,
  withdrawApiKeyDecisions,
});
