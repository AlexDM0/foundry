/**
 * The open decisions and their escalations. What matters: an agent's questions come first, before the code-opened kinds, and an
 * escalated one is marked; only an `incident-escalated` record with a decision id escalates, so another kind naming a decision or an
 * escalation without one adds nothing; and the incident that escalated a decision is the newest record's, or none.
 */
import { describe, expect, test } from 'bun:test';

import type { DecisionDocument, HistoryRecordDocument } from '../@types/ConversationDocuments.ts';
import { OpenDecisionsUtil }                            from './OpenDecisionsUtil.ts';

const AT = '2026-10-29T20:00:00+01:00';

function decisionOf(id: string, kind: string): DecisionDocument {
  return {
    id, kind, ticketIds: ['042'], jobId: 'J3', askedBy: 'builder', questions: [], context: 'Example context', openedAt: AT
  };
}

const HISTORY: readonly HistoryRecordDocument[] = [
  {
    kind: 'incident-escalated', at: AT, incidentId: 'I4', fields: { decisionId: 'E3' }
  },
  {
    kind: 'incident-noted', at: AT, incidentId: 'I5', fields: { decisionId: 'E1' }
  },
  {
    kind: 'incident-escalated', at: AT, incidentId: 'I6', fields: {}
  },
  {
    kind: 'incident-escalated', at: AT, incidentId: 'I7', fields: { decisionId: 'E3' }
  },
];

describe('OpenDecisionsUtil.openDecisionsOf', () => {
  test('lists agent questions first, then the code-opened kinds, marking the escalated one', () => {
    const board = { decisions: [decisionOf('E1', 'parked'), decisionOf('E2', 'agent-question'), decisionOf('E3', 'agent-question')], questionHistory: HISTORY };
    expect(OpenDecisionsUtil.openDecisionsOf(board).map(({ decision, escalated }) => [decision.id, escalated])).toEqual([['E2', false], ['E3', true], ['E1', false]]);
  });

  test('a board without a log marks no decision escalated', () => {
    expect(OpenDecisionsUtil.openDecisionsOf({ decisions: [decisionOf('E3', 'agent-question')] })).toEqual([{ decision: decisionOf('E3', 'agent-question'), escalated: false }]);
  });
});

describe('OpenDecisionsUtil.escalatedDecisionIdsOf', () => {
  test('only an incident-escalated record with a decision id escalates that decision', () => {
    expect([...OpenDecisionsUtil.escalatedDecisionIdsOf(HISTORY)]).toEqual(['E3']);
  });
});

describe('OpenDecisionsUtil.escalatingIncidentIdOf', () => {
  test('is the incident of the newest escalation of the decision, and none for a decision no incident escalated', () => {
    expect(OpenDecisionsUtil.escalatingIncidentIdOf(HISTORY, 'E3')).toBe('I7');
    expect(OpenDecisionsUtil.escalatingIncidentIdOf(HISTORY, 'E1')).toBeNull();
  });
});
