/**
 * Example Storefront's board as the in-place artboard draws it, matching the five forges' fleet: one job builds #014 Password reset flow
 * and asked a question that waits on User, while another builds #016, over the pipeline view's live flow. Test-only.
 */
import type { BoardDecisionDocument } from '../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }         from '../../@types/board/BoardDocument.ts';
import type { BoardTicketDocument }   from '../../@types/board/BoardTicketDocuments.ts';
import {
  boardStateFixture,
  exampleAgentJob,
  examplePageTicketFacts,
  exampleTask,
} from '../../board/testing/BoardStateFixture.ts';
import { pipelineBoardStateOf }              from '../../board/testing/PipelineFixture.ts';
import { examplePanelTicket, exampleOption } from '../../board/testing/QuestionPanelFixture.ts';
import { FLEET_FIXTURES_READ_AT }            from './fleet-five-forges.ts';

const FIXTURE_DAY = FLEET_FIXTURES_READ_AT.slice(0, 'yyyy-mm-dd'.length);

const PASSWORD_RESET_TICKET: BoardTicketDocument = examplePanelTicket('014', {
  title:    'Password reset flow',
  bodyHtml: '<h2>Wanted</h2><p>A customer who forgot the password sets a new one from a link sent by email.</p>',
  sections: [
    { heading: 'Wanted', markdown: 'A customer who forgot the password sets a new one from a link sent by email.' },
    { heading: 'Brief', markdown: 'Work belongs in `src/account/password-reset/**`.' },
  ],
  acceptanceItems: [
    { label: 'A1', text: 'The reset link works once and then expires.', waived: false },
    { label: 'A2', text: 'An expired link says so and offers to send a new one.', waived: false },
  ],
});

const ORDER_HISTORY_TICKET: BoardTicketDocument = examplePanelTicket('016', { title: 'Order history page' });

const RESET_LINK_QUESTION: BoardDecisionDocument = {
  id:        'E2',
  kind:      'agent-question',
  ticketIds: ['014'],
  jobId:     'J3',
  askedBy:   'builder',
  context:   'The ticket says the link expires, but not after how long.',
  openedAt:  '2026-11-12T13:15:10.000Z',
  document:  null,
  anchor:    null,
  placement: null,
  questions: [{
    question:    'How long should a password reset link stay valid?',
    header:      'Link lifetime',
    multiSelect: false,
    options:     [
      exampleOption({
        letter:           'a',
        label:            'One hour',
        description:      'Long enough to find the email, short enough to limit a leaked link.',
        recommended:      true,
        touches:          ['src/account/password-reset/ResetLink.ts'],
        tradeOff:         'A customer who waits longer asks for a new link.',
        acceptanceEffect: 'meets A1 and A2 as written',
      }),
      exampleOption({ letter: 'b', label: 'Twenty-four hours', description: 'The link survives a night.' }),
      exampleOption({ letter: 'c', label: 'Fifteen minutes', description: 'The shortest window the mail provider delivers within.' }),
    ],
  }],
};

export function storefrontBoardOf(trackerId: string): BoardDocument {
  const fixture = boardStateFixture();
  const tickets = [PASSWORD_RESET_TICKET, ORDER_HISTORY_TICKET];
  const jobs = [
    exampleAgentJob({ id: 'J3', ticketIds: ['014'], launchedAt: '2026-11-12T13:09:50.000Z' }),
    exampleAgentJob({ id: 'J4', ticketIds: ['016'], launchedAt: '2026-11-12T13:02:10.000Z' }),
  ];
  const tasks = [
    exampleTask({
      id: 1, name: '#014 Password reset flow', ticket: '014', status: 'in-progress'
    }),
    exampleTask({
      id: 2, name: '#016 Order history page', ticket: '016', status: 'in-progress'
    }),
  ];
  return boardStateFixture({
    trackerId,
    project:         'Example Storefront',
    concurrency:     { limit: 4, agentsInFlight: jobs.length },
    launchSlots:     { limit: 4, slotJobIds: jobs.map(({ id }) => id), inProgressTicketIdsWithoutJob: [] },
    jobs,
    decisions:       [RESET_LINK_QUESTION],
    openDecisionIds: [RESET_LINK_QUESTION.id],
    attention:       [{
      key:                     'decision:E2',
      kind:                    'question',
      idText:                  'E2',
      ticketIds:               ['014'],
      subject:                 'How long should a password reset link stay valid?',
      jobId:                   'J3',
      askedBy:                 'builder',
      decisionKind:            null,
      escalatedFromIncidentId: null,
      metaText:                'asked by J3 builder',
      stamp:                   RESET_LINK_QUESTION.openedAt,
      stampWord:               'opened',
      actionLabel:             'Answer',
      target:                  { subject: 'decision', id: 'E2' },
    }],
    questionHistory: [],
    mergeQueue:      { queuedTicketIds: [], targets: [] },
    pipeline:        pipelineBoardStateOf('A5').pipeline,
    page:            {
      ...fixture.page,
      progress: { ...fixture.page.progress, tasks },
      tickets,
      facts:    {
        ...fixture.page.facts,
        rows:    tasks.map((task) => ({ displayState: task.status, deliveredRowCountsAsReviewed: false, ownRowPositionOfReviewedTicket: null })),
        tickets: tickets.map(examplePageTicketFacts),
        epics:   [],
      },
    },
    today: { calendarDate: FIXTURE_DAY, deliveredTickets: 0, tokens: 0 },
  });
}
