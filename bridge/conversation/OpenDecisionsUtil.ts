/**
 * The open decisions in the order User answers them, `agent-question` first, with the ones an Assistant escalated marked; and which
 * incident escalated a decision, read from the `incident-escalated` records of the log.
 */
import type { ConversationBoardDocument, DecisionDocument, HistoryRecordDocument } from '../@types/ConversationDocuments.ts';

export interface OpenDecision {
  readonly decision:  DecisionDocument;
  /** True when an Assistant put an agent's report to User unchanged with `incident escalate`. */
  readonly escalated: boolean;
}

type OpenDecisionsBoard = Pick<ConversationBoardDocument, 'decisions' | 'questionHistory'>;

const AGENT_QUESTION_KIND = 'agent-question';

const INCIDENT_ESCALATED_KIND = 'incident-escalated';

function escalatedDecisionIdOf(record: HistoryRecordDocument): string | null {
  const { decisionId } = record.fields;
  return record.kind === INCIDENT_ESCALATED_KIND && typeof decisionId === 'string' ? decisionId : null;
}

function escalatedDecisionIdsOf(history: readonly HistoryRecordDocument[]): ReadonlySet<string> {
  return new Set(history.flatMap((record) => escalatedDecisionIdOf(record) ?? []));
}

/** The incident of the newest escalation that opened the decision, or `null` when no incident escalated it. */
function escalatingIncidentIdOf(history: readonly HistoryRecordDocument[], decisionId: string): string | null {
  return history.findLast((record) => escalatedDecisionIdOf(record) === decisionId)?.incidentId ?? null;
}

/** The order User answers decisions in: an agent's questions first, then the ones code opened, each in the board's order. */
function answeringOrderOf<Decision extends Pick<DecisionDocument, 'kind'>>(decisions: readonly Decision[]): Decision[] {
  return [...decisions.filter((decision) => decision.kind === AGENT_QUESTION_KIND), ...decisions.filter((decision) => decision.kind !== AGENT_QUESTION_KIND)];
}

function openDecisionsOf(board: OpenDecisionsBoard): OpenDecision[] {
  const escalatedIds = escalatedDecisionIdsOf(board.questionHistory ?? []);
  return answeringOrderOf(board.decisions).map((decision) => ({ decision, escalated: escalatedIds.has(decision.id) }));
}

export const OpenDecisionsUtil = Object.freeze({
  openDecisionsOf, answeringOrderOf, escalatedDecisionIdsOf, escalatingIncidentIdOf
});
