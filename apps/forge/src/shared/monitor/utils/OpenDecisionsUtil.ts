/**
 * The open decisions in the order User answers them, `agent-question` first, with the ones an Assistant escalated marked; and which
 * incident escalated a decision, read from the `incident-escalated` records of the log. The board document and the monitor snapshot read it alike.
 */

/** A log record as far as an escalation reads it: the Board's records and the served history documents both fit. */
export interface EscalationRecord {
  readonly kind:        string;
  readonly incidentId?: string;
  readonly fields:      Readonly<Record<string, unknown>>;
}

export interface OpenDecision<Decision> {
  readonly decision:  Decision;
  /** True when an Assistant put an agent's report to User unchanged with `incident escalate`. */
  readonly escalated: boolean;
}

interface OpenDecisionsBoard<Decision> {
  readonly decisions:        readonly Decision[];
  readonly questionHistory?: readonly EscalationRecord[];
}

const AGENT_QUESTION_KIND = 'agent-question';

const INCIDENT_ESCALATED_KIND = 'incident-escalated';

function escalatedDecisionIdOf(record: EscalationRecord): string | null {
  const { decisionId } = record.fields;
  return record.kind === INCIDENT_ESCALATED_KIND && typeof decisionId === 'string' ? decisionId : null;
}

function escalatedDecisionIdsOf(history: readonly EscalationRecord[]): ReadonlySet<string> {
  return new Set(history.flatMap((record) => escalatedDecisionIdOf(record) ?? []));
}

/** The incident of the newest escalation that opened the decision, or `null` when no incident escalated it. */
function escalatingIncidentIdOf(history: readonly EscalationRecord[], decisionId: string): string | null {
  return history.findLast((record) => escalatedDecisionIdOf(record) === decisionId)?.incidentId ?? null;
}

/** The order User answers decisions in: an agent's questions first, then the ones code opened, each in the board's order. */
function answeringOrderOf<Decision extends { readonly kind: string }>(decisions: readonly Decision[]): Decision[] {
  return [...decisions.filter((decision) => decision.kind === AGENT_QUESTION_KIND), ...decisions.filter((decision) => decision.kind !== AGENT_QUESTION_KIND)];
}

function openDecisionsOf<Decision extends { readonly id: string; readonly kind: string }>(board: OpenDecisionsBoard<Decision>): OpenDecision<Decision>[] {
  const escalatedIds = escalatedDecisionIdsOf(board.questionHistory ?? []);
  return answeringOrderOf(board.decisions).map((decision) => ({ decision, escalated: escalatedIds.has(decision.id) }));
}

export const OpenDecisionsUtil = Object.freeze({
  openDecisionsOf, answeringOrderOf, escalatedDecisionIdsOf, escalatingIncidentIdOf
});
