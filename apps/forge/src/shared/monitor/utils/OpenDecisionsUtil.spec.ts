/**
 * The open decisions and their escalations: an agent's questions come first, before the code-opened kinds, each in board order, and an
 * escalated one is marked; only an `incident-escalated` record with a decision id escalates; and the incident that escalated a decision
 * is the newest record's, or none.
 */
import { describe, expect, test } from 'bun:test';

import { OpenDecisionsUtil, type EscalationRecord } from './OpenDecisionsUtil.ts';

const AT = '2026-10-29T20:00:00+01:00';

interface ExampleDecision {
  readonly id:       string;
  readonly kind:     string;
  readonly context:  string;
  readonly openedAt: string;
}

function decisionOf(id: string, kind: string): ExampleDecision {
  return {
    id, kind, context: 'Example context', openedAt: AT
  };
}

const HISTORY: readonly (EscalationRecord & { readonly at: string })[] = [
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

describe('OpenDecisionsUtil.answeringOrderOf', () => {
  test('puts the agent questions first and keeps the board\'s order within each, reading only the kind', () => {
    const decisions = [{ id: 'E1', kind: 'parked' }, { id: 'E2', kind: 'agent-question' }, { id: 'E3', kind: 'outage' }, { id: 'E4', kind: 'agent-question' }];
    expect(OpenDecisionsUtil.answeringOrderOf(decisions).map((decision) => decision.id)).toEqual(['E2', 'E4', 'E1', 'E3']);
  });
});

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
