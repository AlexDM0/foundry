/**
 * A synthetic board where every kind of thing waits on User: an escalated question, a question with its job, a code-opened question with
 * none, two draft tickets, a filing draft waiting on an answer beside one still researching, a ticket ready for review and one waiting
 * for the merge accept, and one open incident. Built on `boardStateFixture`, whose default stays untouched. Test-only.
 */
import type { BoardStateDocument, PageTicketDocument } from '../@types/BoardStateDocument.ts';
import type {
  ConversationBoardDocument,
  DecisionDocument,
  HistoryRecordDocument,
  IncidentDocument
} from '../@types/ConversationDocuments.ts';
import { boardStateFixture }        from './BoardStateFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES } from './TimestampSlicesFixture.ts';

export type WaitingOnUserFixtureBoard = BoardStateDocument & ConversationBoardDocument;

export const WAITING_FIXTURE_NOW = new Date('2026-11-09T14:20:20');

function questionOf(question: string): DecisionDocument['questions'] {
  return [{
    question, header: 'Example', multiSelect: false, options: [{ label: 'Yes', description: 'Example yes', isRecommended: false }]
  }];
}

function exampleDecision(changes: Partial<DecisionDocument> & Pick<DecisionDocument, 'id' | 'openedAt'>): DecisionDocument {
  return {
    kind:      'agent-question',
    ticketIds: [],
    jobId:     null,
    askedBy:   'builder',
    questions: questionOf('Example question?'),
    context:   'Example context',
    ...changes,
  };
}

export const ESCALATED_DECISION = exampleDecision({
  id: 'E3', ticketIds: ['008'], jobId: 'J3', openedAt: '2026-11-09T14:19:40', questions: questionOf('Example rate-limit window: per customer or per address?'),
});

export const CODE_OPENED_DECISION = exampleDecision({
  id: 'E2', kind: 'leftover-worktree', ticketIds: ['002'], askedBy: 'overseer', openedAt: '2026-11-09T10:58:00', questions: [], context: 'Example worktree left on a branch',
});

export const AGENT_DECISION = exampleDecision({
  id: 'E4', ticketIds: ['004'], jobId: 'J4', openedAt: '2026-11-09T14:19:55', questions: questionOf('Example table rows: zebra or dividers?'),
});

export const ESCALATION_RECORD: HistoryRecordDocument = {
  kind: 'incident-escalated', at: '2026-11-09T14:19:40', incidentId: 'I2', fields: { decisionId: 'E3' },
};

export const OPEN_INCIDENT: IncidentDocument = {
  id: 'I5', kind: 'gate-failed', ticketIds: ['004'], jobId: 'J4', facts: {}, defaultMove: 'park', deliveredInTurn: null, openedAt: '2026-11-09T14:00:00',
};

function exampleTicket(changes: Partial<PageTicketDocument> & Pick<PageTicketDocument, 'id' | 'title' | 'status' | 'updated'>): PageTicketDocument {
  return {
    filed: changes.updated, delivered: null, abandonedAt: null, ...changes,
  };
}

export const WAITING_TICKETS: readonly PageTicketDocument[] = [
  exampleTicket({
    id: '009', title: 'Example dates in the shop time zone', status: 'draft', updated: '2026-11-09T11:52:00',
  }),
  exampleTicket({
    id: '015', title: 'Example search suggestions', status: 'draft', updated: '2026-11-09T13:31:00',
  }),
  exampleTicket({
    id: '006', title: 'Example review ready', status: 'ready-for-review', filed: '2026-11-08T09:00:00', updated: '2026-11-09T12:00:00',
  }),
  exampleTicket({
    id: '005', title: 'Example reviewed change', status: 'in-review', filed: '2026-11-07T09:00:00', updated: '2026-11-09T13:00:00',
  }),
  exampleTicket({
    id: '010', title: 'Example in progress', status: 'in-progress', updated: '2026-11-09T08:00:00',
  }),
];

/** Everything waits unless the changes say otherwise. */
export function waitingOnUserBoard(changes: Partial<WaitingOnUserFixtureBoard> = {}): WaitingOnUserFixtureBoard {
  const base = boardStateFixture();
  const { page } = base;
  if (page === undefined) throw new Error('the board fixture serves no page');
  return {
    ...base,
    jobs:            [],
    decisions:       [AGENT_DECISION, CODE_OPENED_DECISION, ESCALATED_DECISION],
    incidents:       [OPEN_INCIDENT],
    questionHistory: [ESCALATION_RECORD],
    page:            {
      ...page,
      tickets: WAITING_TICKETS,
      payload: {
        ...page.payload,
        boardFacts: {
          ...page.payload.boardFacts,
          drafts: [
            {
              id: 'D2', title: 'Example filing draft', state: 'waiting', openQuestionCount: 2, openedAt: '2026-11-09T09:30:00',
            },
            {
              id: 'D3', title: 'Example draft in research', state: 'researching', openQuestionCount: 0, openedAt: '2026-11-09T09:00:00',
            },
          ],
        },
        limits: EXAMPLE_TIMESTAMP_SLICES,
      },
    },
    mergeQueue: {
      targets: [{
        target:          'main',
        holder:          null,
        order:           [],
        waitingForMerge: [{
          ticketId: '005', priority: 'normal', againstTarget: 'clean', conflictedFiles: []
        }],
        pairwiseConflicts:      [],
        targetMovedDecisionIds: [],
      }],
    },
    ...changes,
  };
}

/** A board where nothing waits on User and no incident is open: no decision, no draft, and only a ticket in progress. */
export function nothingWaitingBoard(): WaitingOnUserFixtureBoard {
  const board = waitingOnUserBoard({
    decisions: [], incidents: [], questionHistory: [], mergeQueue: { targets: [] },
  });
  const { page } = board;
  if (page === undefined) throw new Error('the waiting board serves no page');
  return {
    ...board,
    page: {
      ...page,
      tickets: WAITING_TICKETS.filter((ticket) => ticket.status === 'in-progress'),
      payload: { ...page.payload, boardFacts: { ...page.payload.boardFacts, drafts: [] } },
    },
  };
}
