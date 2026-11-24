/**
 * A synthetic board in the page's board contract for the header, epics, finished-work, merge-queue and Agents specs: two epics, five
 * tickets, one queued target, a builder holding the one taken launch slot and the Assistant beside it; and builders of a ticket, a job, a
 * subagent and an open decision a job asks User, each with the facts and offers the forge serves for it. Test-only.
 */
import type { BoardDecisionDocument }                                             from '../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                                                     from '../../@types/board/BoardDocument.ts';
import type { BoardNoticeDocument }                                               from '../../@types/board/BoardFactDocuments.ts';
import type { BoardJobDocument, BoardMergeTargetDocument, BoardSubagentDocument } from '../../@types/board/BoardJobDocuments.ts';
import type {
  BoardEpicDocument,
  BoardPageTicketFactsDocument,
  BoardTaskDocument,
  BoardTicketDocument
} from '../../@types/board/BoardTicketDocuments.ts';
import type { BoardTicketStatus } from '../../@types/board/BoardVocabulary.ts';
import { exampleBoardAgent }      from './AgentFixture.ts';
import { EXAMPLE_BOARD_LIMITS }   from './PageLimitsFixture.ts';

export const FIXTURE_NOW = new Date('2026-10-29T12:00:00');

export const FIXTURE_TRACKER_ID = 'example-tracker';

const NO_TICKET_COUNTS: Readonly<Record<BoardTicketStatus, number>> = {
  'draft':            0,
  'ready-for-review': 0,
  'committed':        0,
  'in-progress':      0,
  'in-review':        0,
  'reviewed':         0,
  'delivered':        0,
  'abandoned':        0,
};

/** An epic's count of tickets in every status, zero where the counts name none. */
export function ticketCountByStatusOf(counts: Partial<Record<BoardTicketStatus, number>>): Readonly<Record<BoardTicketStatus, number>> {
  return { ...NO_TICKET_COUNTS, ...counts };
}

/** A ticket as the board serves it, with the forge's facts and offers: a committed ticket that offers nothing unless the changes say otherwise. */
export function exampleTicket(changes: Partial<BoardTicketDocument> & Pick<BoardTicketDocument, 'id' | 'title'>): BoardTicketDocument {
  return {
    type:            'ticket',
    status:          'committed',
    priority:        null,
    size:            null,
    hold:            null,
    epics:           [],
    group:           null,
    releasesGroup:   false,
    dependsOn:       [],
    branch:          null,
    commit:          null,
    reason:          null,
    network:         [],
    entity:          null,
    crosses:         [],
    introducedBy:    null,
    foundInReview:   null,
    filedByJob:      null,
    task:            null,
    filed:           changes.updated ?? '2026-10-28T08:00:00',
    updated:         '2026-10-28T08:00:00',
    started:         null,
    finished:        null,
    delivered:       null,
    abandonedAt:     null,
    bodyHtml:        '',
    sections:        [],
    acceptanceItems: [],
    facts:           {
      resolvedPriority: 'normal', settlesADependency: false, isClosed: false, noAgentHasPickedItUp: true, reviewRound: null, isRepeatReview: false
    },
    offers: { kinds: [], priorityChoices: [] },
    ...changes,
  };
}

export const FIXTURE_TICKETS: readonly BoardTicketDocument[] = [
  exampleTicket({
    id:        '1',
    title:     'Example delivered long ago',
    status:    'delivered',
    updated:   '2026-10-20T10:00:00',
    delivered: '2026-10-20T10:00:00',
    facts:     {
      resolvedPriority: 'normal', settlesADependency: true, isClosed: true, noAgentHasPickedItUp: false, reviewRound: 1, isRepeatReview: false
    },
  }),
  exampleTicket({
    id:        '2',
    title:     'Example delivered this morning',
    status:    'delivered',
    updated:   '2026-10-29T09:00:00',
    delivered: '2026-10-29T09:00:00',
    facts:     {
      resolvedPriority: 'normal', settlesADependency: true, isClosed: true, noAgentHasPickedItUp: false, reviewRound: 1, isRepeatReview: false
    },
  }),
  exampleTicket({
    id: '3', title: 'Example in progress', status: 'in-progress', updated: '2026-10-29T08:00:00',
  }),
  exampleTicket({
    id: '4', title: 'Example waiting', status: 'committed', updated: '2026-10-28T08:00:00',
  }),
  exampleTicket({
    id:          '5',
    title:       'Example abandoned yesterday',
    status:      'abandoned',
    updated:     '2026-10-28T20:00:00',
    abandonedAt: '2026-10-28T20:00:00',
    facts:       {
      resolvedPriority: 'normal', settlesADependency: false, isClosed: true, noAgentHasPickedItUp: false, reviewRound: null, isRepeatReview: false
    },
  }),
];

export const OPEN_EPIC: BoardEpicDocument = {
  key:                 'checkout',
  title:               'Example checkout',
  slot:                1,
  ticketIds:           ['2', '3', '4'],
  ticketCountByStatus: ticketCountByStatusOf({ 'delivered': 1, 'in-progress': 1, 'committed': 1 }),
  tokens:              12_400,
  span:                { start: '2026-10-28T08:00:00', end: null },
};

export const FINISHED_EPIC: BoardEpicDocument = {
  key:                 'archive',
  title:               'Example archive',
  slot:                2,
  ticketIds:           ['1'],
  ticketCountByStatus: ticketCountByStatusOf({ delivered: 1 }),
  tokens:              800,
  span:                { start: '2026-10-19T08:00:00', end: '2026-10-20T10:00:00' },
};

export const PLANTED_DESCRIPTION_HTML = '<p>Example summary</p><img src=x onerror="window.plantedRan = true"><script>window.plantedRan = true</script>'
  + '<a href="javascript:window.plantedRan = true">planted</a>';

export const QUEUED_TARGET: BoardMergeTargetDocument = {
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
  waitingForMerge:        [],
  pairwiseConflicts:      [['8', '10']],
  targetMovedDecisionIds: ['E4'],
};

export const DIRTY_CHECKOUT_NOTICE: BoardNoticeDocument = {
  kind:      'dirty-main-checkout',
  facts:     { target: 'main', branch: 'main', blockingFiles: ['README.md'] },
  text:      'landings on main wait: the main checkout\'s changes to README.md block the fast-forward',
  causeText: null,
};

/** A job as the board serves it: a running builder on ticket 3 unless the changes say otherwise. */
export function exampleAgentJob(changes: Partial<BoardJobDocument> & Pick<BoardJobDocument, 'id'>): BoardJobDocument {
  return {
    kind:          'build',
    role:          'builder',
    ticketIds:     ['3'],
    state:         'running',
    attempt:       1,
    childInstance: 1,
    crashResumes:  0,
    launchedAt:    '2026-10-29T11:20:00',
    airlockPhase:  null,
    interruption:  null,
    lostLine:      null,
    waitsFor:      null,
    stopRequest:   null,
    intake:        null,
    entity:        null,
    notLaunched:   null,
    live:          {
      calls:                  12,
      callBudget:             150,
      tokens:                 3000,
      toolCalls:              7,
      lastToolCall:           null,
      subagents:              [],
      toolCallsWithSubagents: 7,
      silentSweeps:           0,
      turn:                   null,
      messagesWaiting:        0,
      lastLine:               null,
    },
    stopHolds: { stop: 'Example hold: stopped by User', windDown: 'Example hold: wound down by User' },
    offers:    { stopModes: ['stop', 'wind-down'], takesFresh: true, takesMessage: true },
    ...changes,
  };
}

/** A subagent as a job's live facts serve it: a running one with a description unless the changes say otherwise. */
export function exampleSubagent(changes: Partial<BoardSubagentDocument> & Pick<BoardSubagentDocument, 'parentToolUseId'>): BoardSubagentDocument {
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
export function exampleAskingDecision(changes: Partial<BoardDecisionDocument> & Pick<BoardDecisionDocument, 'id' | 'jobId'>): BoardDecisionDocument {
  return {
    kind:      'agent-question',
    ticketIds: [],
    askedBy:   'builder',
    questions: [{
      question: 'Should the example gift card skip payment?', header: 'Example', multiSelect: false, options: []
    }],
    context:  '',
    openedAt: '2026-10-29T11:51:00',
    ...changes,
  };
}

export const FIXTURE_BUILDER_JOB = exampleAgentJob({ id: 'J12' });

export const FIXTURE_ASSISTANT_JOB = exampleAgentJob({
  id: 'J1', kind: 'assistant', role: 'assistant', ticketIds: [], launchedAt: '2026-10-29T08:00:00'
});

/** A chart row as the board serves it: a delivered row of its own ticket unless the changes say otherwise. */
export function exampleTask(changes: Partial<BoardTaskDocument> & Pick<BoardTaskDocument, 'id' | 'name'>): BoardTaskDocument {
  return {
    status:         'delivered',
    start:          null,
    end:            null,
    owner:          '',
    note:           '',
    ticket:         null,
    tokens:         null,
    reviewed:       null,
    reviewRound:    null,
    history:        null,
    reviewOf:       null,
    reviewBarRound: null,
    ...changes,
  };
}

const FIXTURE_TASKS: readonly BoardTaskDocument[] = [
  exampleTask({
    id: 3, name: '#3 Example in progress', status: 'in-progress', start: '2026-10-29T11:20:00', ticket: '3', tokens: 3000
  }),
  exampleTask({
    id: 2, name: '#2 Example delivered this morning', start: '2026-10-29T08:00:00', end: '2026-10-29T09:00:00', ticket: '2', tokens: 1500
  }),
  exampleTask({
    id: 1, name: '#1 Example delivered long ago', start: '2026-10-20T08:00:00', end: '2026-10-20T10:00:00', ticket: '1', tokens: 900
  }),
];

/** A ticket's page facts as the board serves them: shown in its own status, on no row, waiting on nothing. */
export function examplePageTicketFacts(ticket: Pick<BoardTicketDocument, 'id' | 'status'>): BoardPageTicketFactsDocument {
  return {
    ticketId:           ticket.id,
    ownRowPosition:     null,
    reviewBarPositions: [],
    displayState:       ticket.status,
    waitingOnTicketIds: [],
    entity:             null,
    stage:              null,
  };
}

export function boardStateFixture(changes: Partial<BoardDocument> = {}): BoardDocument {
  return {
    boardVersion: 1,
    trackerId:    FIXTURE_TRACKER_ID,
    project:      'Example Agency',
    hephaestus:   { state: 'serving', paused: false, codeVersion: 'code-1' },
    concurrency:  { limit: 4, agentsInFlight: 1 },
    launchSlots:  { limit: 4, slotJobIds: ['J12'], inProgressTicketIdsWithoutJob: [] },
    usage:        { resetsAt: null, window: null, windows: [] },
    agent:        exampleBoardAgent(),
    page:         {
      progress: {
        startedAt: '2026-10-20T08:00:00', view: { kind: 'auto' }, hephaestusSetting: 'running', tasks: FIXTURE_TASKS, log: []
      },
      epicDescriptions: [{ key: 'checkout', descriptionHtml: PLANTED_DESCRIPTION_HTML }, { key: 'archive', descriptionHtml: '' }],
      draftRequests:    [],
      facts:            {
        rows:         FIXTURE_TASKS.map((task) => ({ displayState: task.status, deliveredRowCountsAsReviewed: false, ownRowPositionOfReviewedTicket: null })),
        tickets:      FIXTURE_TICKETS.map(examplePageTicketFacts),
        epics:        [FINISHED_EPIC, OPEN_EPIC],
        readyTickets: [],
        drafts:       [],
      },
      tickets: FIXTURE_TICKETS,
    },
    mergeQueue:      { queuedTicketIds: ['8', '9'], targets: [QUEUED_TARGET] },
    jobs:            [FIXTURE_ASSISTANT_JOB, FIXTURE_BUILDER_JOB],
    endedJobs:       [],
    decisions:       [exampleAskingDecision({ id: 'E4', jobId: 'J12' })],
    incidents:       [],
    questionHistory: [],
    ticketForecasts: [],
    pipeline:        {
      applied:          { readingVerdict: 'absent' },
      setup:            null,
      flow:             null,
      profileRuns:      [],
      gateCacheMarks:   [],
      stepRunTimes:     [],
      history:          [],
      choices:          { models: ['sonnet', 'opus'], efforts: ['low', 'medium', 'high'] },
      agentDefaults:    { model: 'opus', effort: 'high' },
      entityAssignment: null,
    },
    assistantIsOn:        false,
    pictureLimits:        null,
    limits:               EXAMPLE_BOARD_LIMITS,
    notices:              [],
    warnings:             [],
    attention:            [],
    today:                { calendarDate: '2026-10-29', deliveredTickets: 1, tokens: 4500 },
    openDecisionIds:      ['E4'],
    escalatedDecisionIds: [],
    ...changes,
  };
}
