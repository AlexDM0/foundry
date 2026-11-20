/**
 * A synthetic `BoardState` for the header, epics, finished-work, merge-queue and Agents specs: two epics, five tickets, one queued
 * target, a builder holding the one taken launch slot and the Assistant beside it; and builders of a job, a subagent and an open
 * decision a job asks User.
 */
import type {
  BoardStateDocument,
  EpicRollupDocument,
  MergeTargetDocument,
  NoticeDocument,
  PageTicketDocument
} from '../@types/BoardStateDocument.ts';
import type { AgentJobDocument, AskingDecisionDocument, SubagentDocument } from '../views/agents/AgentJobDocument.ts';

export const FIXTURE_NOW = new Date('2026-10-29T12:00:00');

export const FIXTURE_TICKETS: readonly PageTicketDocument[] = [
  {
    id: '1', title: 'Example delivered long ago', status: 'delivered', updated: '2026-10-20T10:00:00', delivered: '2026-10-20T10:00:00', abandonedAt: null
  },
  {
    id: '2', title: 'Example delivered this morning', status: 'delivered', updated: '2026-10-29T09:00:00', delivered: '2026-10-29T09:00:00', abandonedAt: null
  },
  {
    id: '3', title: 'Example in progress', status: 'in-progress', updated: '2026-10-29T08:00:00', delivered: null, abandonedAt: null
  },
  {
    id: '4', title: 'Example waiting', status: 'committed', updated: '2026-10-28T08:00:00', delivered: null, abandonedAt: null
  },
  {
    id: '5', title: 'Example abandoned yesterday', status: 'abandoned', updated: '2026-10-28T20:00:00', delivered: null, abandonedAt: '2026-10-28T20:00:00'
  },
];

export const OPEN_EPIC: EpicRollupDocument = {
  key:                 'checkout',
  title:               'Example checkout',
  slot:                1,
  ticketIds:           ['2', '3', '4'],
  ticketCountByStatus: { 'delivered': 1, 'in-progress': 1, 'committed': 1 },
  tokens:              12_400,
  span:                { start: '2026-10-28T08:00:00', end: null },
};

export const FINISHED_EPIC: EpicRollupDocument = {
  key:                 'archive',
  title:               'Example archive',
  slot:                2,
  ticketIds:           ['1'],
  ticketCountByStatus: { delivered: 1 },
  tokens:              800,
  span:                { start: '2026-10-19T08:00:00', end: '2026-10-20T10:00:00' },
};

export const PLANTED_DESCRIPTION_HTML = '<p>Example summary</p><img src=x onerror="window.plantedRan = true"><script>window.plantedRan = true</script>'
  + '<a href="javascript:window.plantedRan = true">planted</a>';

export const QUEUED_TARGET: MergeTargetDocument = {
  target: 'main',
  holder: { jobId: 'J12', ticketIds: ['7'], phase: 'gating' },
  order:  [
    {
      ticketId: '8', priority: 'high', againstTarget: 'clean', conflictedFiles: [], conflictsCaused: 1
    },
    {
      ticketId: '9', priority: 'normal', againstTarget: 'conflicting', conflictedFiles: ['src/Example.ts'], conflictsCaused: 0
    },
  ],
  pairwiseConflicts:      [['8', '10']],
  targetMovedDecisionIds: ['E4'],
};

export const DIRTY_CHECKOUT_NOTICE: NoticeDocument = {
  kind: 'dirty-main-checkout', target: 'main', branch: 'main', blockingFiles: ['README.md']
};

/** A job record as `BoardState` serves it: a running builder on ticket 3 unless the changes say otherwise. */
export function exampleAgentJob(changes: Partial<AgentJobDocument> & Pick<AgentJobDocument, 'id'>): AgentJobDocument {
  return {
    kind:          'build',
    role:          'builder',
    ticketIds:     ['3'],
    state:         'running',
    attempt:       1,
    childInstance: 1,
    crashResumes:  0,
    launchedAt:    '2026-10-29T11:20:00',
    live:          {
      calls:                  12,
      callBudget:             150,
      tokens:                 3000,
      toolCalls:              7,
      lastToolCall:           null,
      subagents:              [],
      toolCallsWithSubagents: 7,
      silentSweeps:           0,
    },
    ...changes,
  };
}

/** A subagent as a job's live facts serve it: a running one with a description unless the changes say otherwise. */
export function exampleSubagent(changes: Partial<SubagentDocument> & Pick<SubagentDocument, 'parentToolUseId'>): SubagentDocument {
  return {
    toolCalls:    4,
    lastToolCall: null,
    tokens:       900,
    state:        'running',
    description:  'Example search of the checkout code',
    ...changes,
  };
}

/** An open decision a job asks User, with one question, opened at noon of the fixture's day unless the changes say otherwise. */
export function exampleAskingDecision(changes: Partial<AskingDecisionDocument> & Pick<AskingDecisionDocument, 'id' | 'jobId'>): AskingDecisionDocument {
  return {
    questions: [{ question: 'Should the example gift card skip payment?' }],
    openedAt:  '2026-10-29T11:51:00',
    ...changes,
  };
}

export const FIXTURE_BUILDER_JOB = exampleAgentJob({ id: 'J12' });

export const FIXTURE_ASSISTANT_JOB = exampleAgentJob({
  id: 'J1', kind: 'assistant', role: 'assistant', ticketIds: [], launchedAt: '2026-10-29T08:00:00'
});

export function boardStateFixture(changes: Partial<BoardStateDocument> = {}): BoardStateDocument {
  return {
    project:   'Example Agency',
    jobs:      [FIXTURE_ASSISTANT_JOB, FIXTURE_BUILDER_JOB],
    decisions: [{ id: 'E4' }],
    incidents: [],
    overseer:  {
      state: 'serving', paused: false, codeVersion: 'code-1', batonPassWarning: null
    },
    usage:       { resetsAt: null, window: null },
    notices:     [],
    concurrency: { limit: 4, agentsInFlight: 1 },
    launchSlots: { limit: 4, slotJobIds: ['J12'], inProgressTicketIdsWithoutJob: [] },
    page:        {
      payload: {
        progress: {
          tasks: [
            {
              id: 3, name: '#3 Example in progress', status: 'in-progress', start: '2026-10-29T11:20:00', end: null, ticket: '3', tokens: 3000
            },
            {
              id: 2, name: '#2 Example delivered this morning', status: 'delivered', start: '2026-10-29T08:00:00', end: '2026-10-29T09:00:00', ticket: '2', tokens: 1500
            },
            {
              id: 1, name: '#1 Example delivered long ago', status: 'delivered', start: '2026-10-20T08:00:00', end: '2026-10-20T10:00:00', ticket: '1', tokens: 900
            },
          ],
        },
        epicDescriptions: [{ key: 'checkout', descriptionHtml: PLANTED_DESCRIPTION_HTML }, { key: 'archive', descriptionHtml: '' }],
        boardFacts:       {
          epics:   [FINISHED_EPIC, OPEN_EPIC],
          tickets: FIXTURE_TICKETS.map((ticket) => ({ ticketId: ticket.id, displayState: ticket.status })),
        },
      },
      tickets: FIXTURE_TICKETS,
    },
    mergeQueue: { targets: [QUEUED_TARGET] },
    ...changes,
  };
}
