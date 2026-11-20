/**
 * The Waiting on User list. What matters: each kind comes from its own source; an escalated decision leads, then every other entry oldest
 * first across kinds, a tie in key order, so no clock orders it; each entry names the thing it opens as a typed target, and its route,
 * the Bridge's, opens that thing's place; and a board without its optional slices lists its decisions alone.
 */
import { describe, expect, test } from 'bun:test';

import { attentionEntriesOf, routedAttentionEntryOf, type AttentionBoard } from './AttentionEntries.ts';

function decisionOf(id: string, kind: string, openedAt: string): AttentionBoard['decisions'][number] {
  return {
    id, kind, ticketIds: ['042'], jobId: 'J3', askedBy: 'builder', questions: [{ question: `Example question ${id}` }], context: 'Example context', openedAt
  };
}

const BOARD: AttentionBoard = {
  decisions:       [decisionOf('E1', 'agent-question', '2026-11-12T10:00:00'), decisionOf('E2', 'target-moved', '2026-11-12T08:00:00')],
  questionHistory: [{ kind: 'incident-escalated', incidentId: 'I4', fields: { decisionId: 'E1' } }],
  page:            {
    tickets: [
      {
        id: '009', title: 'Example draft', status: 'draft', filed: '2026-11-12T09:00:00', updated: '2026-11-12T09:00:00'
      },
      {
        id: '006', title: 'Example review', status: 'ready-for-review', updated: '2026-11-12T09:00:00'
      },
      {
        id: '005', title: 'Example reviewed change', status: 'reviewed', updated: '2026-11-12T07:00:00'
      },
    ],
    payload: {
      boardFacts: {
        drafts: [
          {
            id: 'D2', title: 'Example filing draft', state: 'waiting', openQuestionCount: 1, openedAt: '2026-11-12T11:00:00'
          },
          {
            id: 'D3', title: 'Example researching draft', state: 'researching', openQuestionCount: 0, openedAt: '2026-11-12T06:00:00'
          },
        ],
      },
    },
  },
  mergeQueue: { targets: [{ target: 'main', waitingForMerge: [{ ticketId: '005' }] }] },
};

describe('attentionEntriesOf', () => {
  test('lists the escalated decision first, then the rest oldest first, a tie in key order, each with the target it opens', () => {
    expect(attentionEntriesOf(BOARD).map((entry) => [entry.key, entry.kind, entry.target])).toEqual([
      ['decision:E1', 'escalated-question', { subject: 'decision', id: 'E1' }],
      ['merge-accept:005', 'merge-accept', { subject: 'ticket', id: '005' }],
      ['decision:E2', 'question', { subject: 'decision', id: 'E2' }],
      ['ticket:006', 'review', { subject: 'ticket', id: '006' }],
      ['ticket:009', 'draft-ticket', { subject: 'ticket', id: '009' }],
      ['draft:D2', 'filing-draft', { subject: 'draft', id: 'D2' }],
    ]);
  });

  test('a routed entry carries the Bridge\'s route of its target in place of the target', () => {
    expect(attentionEntriesOf(BOARD).map(routedAttentionEntryOf).map((entry) => [entry.key, entry.kind, entry.actionLabel, entry.route])).toEqual([
      ['decision:E1', 'escalated-question', 'Answer', '#questions/E1'],
      ['merge-accept:005', 'merge-accept', 'Accept', '#kanban/ticket/005'],
      ['decision:E2', 'question', 'Answer', '#questions/E2'],
      ['ticket:006', 'review', 'Review', '#kanban/ticket/006'],
      ['ticket:009', 'draft-ticket', 'Ready', '#kanban/ticket/009'],
      ['draft:D2', 'filing-draft', 'Answer', '#kanban/draft/D2'],
    ]);
  });

  test('a routed entry keeps every other field and drops the target', () => {
    const [entry] = attentionEntriesOf(BOARD);
    const routed = entry === undefined ? undefined : routedAttentionEntryOf(entry);
    expect(routed === undefined ? [] : Object.keys(routed).toSorted()).toEqual([...Object.keys(entry ?? {}).filter((field) => field !== 'target'), 'route'].toSorted());
  });

  test('an escalated decision names its incident, a code-opened one its kind, and a filing draft its state line', () => {
    const byKey = new Map(attentionEntriesOf(BOARD).map((entry) => [entry.key, entry]));
    expect(byKey.get('decision:E1')).toMatchObject({ escalatedFromIncidentId: 'I4', decisionKind: null, subject: 'Example question E1' });
    expect(byKey.get('decision:E2')).toMatchObject({ escalatedFromIncidentId: null, decisionKind: 'target-moved' });
    expect(byKey.get('draft:D2')?.metaText).toBe('Waiting on you · 1 open question');
  });

  test('a board without its optional slices lists its decisions alone', () => {
    expect(attentionEntriesOf({ decisions: [decisionOf('E2', 'agent-question', '2026-11-12T08:00:00')] }).map((entry) => entry.key)).toEqual(['decision:E2']);
  });
});
