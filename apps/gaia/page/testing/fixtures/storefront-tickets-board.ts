/**
 * Example Storefront's board as the Tickets artboard draws it (`docs/design/tickets.md`), over the live pipeline of the pipeline view's A5,
 * at the five forges' read moment: on the spec-then-plan route the intake J8 asks two questions, #021, #022 and #019 wait on User, spec
 * and plan agents write #023 and #020, six tickets are under way and forty-one are finished; on the one-ticket route #024 waits for its
 * review and #025 waits to be made ready. Test-only.
 */
import type { BoardDocument }                     from '../../@types/board/BoardDocument.ts';
import type { BoardAttentionEntryDocument }       from '../../@types/board/BoardFactDocuments.ts';
import type { BoardJobDocument }                  from '../../@types/board/BoardJobDocuments.ts';
import type { BoardTicketDocument }               from '../../@types/board/BoardTicketDocuments.ts';
import { exampleAgentJob, exampleAskingDecision } from '../../board/testing/BoardStateFixture.ts';
import { productOwnerJob }                        from '../../board/testing/IntakeBoardFixture.ts';
import { pipelineBoardStateOf }                   from '../../board/testing/PipelineFixture.ts';
import {
  exampleDocumentQuestion,
  exampleDocumentsSummary,
  exampleDraft,
  exampleTicketsBoard,
  exampleTicketsTicket,
  type ExampleTicketsEpic
} from '../../board/testing/TicketsBoardFixture.ts';

/** The read moment, 2026-11-12T13:19:30Z, is 14:19:30 on this wall clock; every stamp keeps it, so a stamp's clock reads as written. */
const DAY = '2026-11-12';
const DAY_BEFORE = '2026-11-11';

function at(clock: string, day = DAY): string {
  return `${day}T${clock}+01:00`;
}

const EPICS: readonly ExampleTicketsEpic[] = [
  { key: 'account', title: 'Account area', slot: 1 },
  { key: 'emails', title: 'Emails', slot: 2 },
  { key: 'checkout', title: 'Checkout', slot: 3 },
  { key: 'catalogue', title: 'Catalogue', slot: 4 },
];

function liveFactsWith(tokens: number): BoardJobDocument['live'] {
  return { ...exampleAgentJob({ id: 'J0' }).live, tokens };
}

const INTAKE_JOB = productOwnerJob({
  id: 'J8', state: 'running', intake: { text: 'Account area changes', title: 'Account area changes' }, launchedAt: at('14:10:00')
});

const DRAFTS: readonly BoardTicketDocument[] = [
  exampleTicketsTicket('021', {
    title:      'Saved addresses list',
    status:     'draft',
    epics:      ['account'],
    filedByJob: 'J5',
    documents:  exampleDocumentsSummary(['awaiting-review', 3]),
    draft:      exampleDraft({ stage: 'spec-review', waitsOnUser: 'approval', waitingSince: at('13:05:00') }),
  }),
  exampleTicketsTicket('022', {
    title:      'Order email footer links',
    status:     'draft',
    epics:      ['emails'],
    filedByJob: 'J5',
    documents:  exampleDocumentsSummary(['drafting', 2]),
    draft:      exampleDraft({ stage: 'spec', waitsOnUser: 'answer', waitingSince: at('14:13:00') }),
  }),
  exampleTicketsTicket('019', {
    title:      'Dark mode toggle in account',
    status:     'draft',
    epics:      ['account'],
    filedByJob: 'J5',
    documents:  exampleDocumentsSummary(['approved', 2], ['awaiting-review', 1]),
    draft:      exampleDraft({ stage: 'plan-review', waitsOnUser: 'approval', waitingSince: at('12:48:00') }),
  }),
  exampleTicketsTicket('023', {
    title:      'Address autocomplete',
    status:     'draft',
    epics:      ['checkout'],
    filedByJob: 'J5',
    documents:  exampleDocumentsSummary(['drafting', 1]),
    draft:      exampleDraft({
      stage: 'spec',
      agent: {
        jobId: 'J9', role: 'spec-agent', tokens: 18_000, since: at('14:15:18')
      }
    }),
  }),
  exampleTicketsTicket('020', {
    title:     'Invoice PDF download',
    status:    'draft',
    epics:     ['account'],
    documents: exampleDocumentsSummary(['approved', 2], ['drafting', 1]),
    draft:     exampleDraft({
      stage: 'plan',
      agent: {
        jobId: 'J10', role: 'plan-agent', tokens: 9000, since: at('14:16:50')
      }
    }),
  }),
];

const ACTIVE: readonly BoardTicketDocument[] = [
  exampleTicketsTicket('012', { title: 'Checkout address form', status: 'in-progress', epics: ['checkout'] }),
  exampleTicketsTicket('014', { title: 'Password reset flow', status: 'in-progress', epics: ['account'] }),
  exampleTicketsTicket('011', { title: 'Cart badge count', status: 'in-review', epics: ['checkout'] }),
  exampleTicketsTicket('016', { title: 'Recently viewed products', epics: ['catalogue'], updated: at('09:40:00') }),
  exampleTicketsTicket('017', { title: 'Gift message at checkout', epics: ['checkout'], updated: at('10:02:00') }),
  exampleTicketsTicket('018', { title: 'Stock alerts by email', epics: ['emails'], updated: at('10:31:00') }),
];

const LATEST_FINISHED: readonly BoardTicketDocument[] = [
  exampleTicketsTicket('010', {
    title: 'Wishlist sharing', status: 'delivered', epics: ['account'], delivered: at('13:05:00')
  }),
  exampleTicketsTicket('009', {
    title: 'Guest checkout', status: 'delivered', epics: ['checkout'], delivered: at('12:02:00')
  }),
  exampleTicketsTicket('008', {
    title: 'Order history filters', status: 'delivered', epics: ['account'], delivered: at('10:57:00')
  }),
  exampleTicketsTicket('007', {
    title: 'Newsletter sign-up', status: 'abandoned', epics: ['emails'], abandonedAt: at('16:20:00', DAY_BEFORE)
  }),
  exampleTicketsTicket('006', {
    title: 'Size guide modal', status: 'delivered', epics: ['catalogue'], delivered: at('15:41:00', DAY_BEFORE)
  }),
  exampleTicketsTicket('005', {
    title: 'Product reviews stars', status: 'delivered', epics: ['catalogue'], delivered: at('14:53:00', DAY_BEFORE)
  }),
];

const EARLIER_FINISHED_COUNT = 35;

/** Finished before the last day, behind "show all". */
const EARLIER_FINISHED: readonly BoardTicketDocument[] = Array.from({ length: EARLIER_FINISHED_COUNT }, (_unused, index) => exampleTicketsTicket(
  String(100 + index),
  { title: `Earlier example ticket ${index + 1}`, status: 'delivered', delivered: at('09:00:00', '2026-11-02') },
));

const JOBS: readonly BoardJobDocument[] = [
  INTAKE_JOB,
  exampleAgentJob({
    id: 'J2', ticketIds: ['012'], launchedAt: at('14:07:26'), live: liveFactsWith(84_000)
  }),
  exampleAgentJob({
    id: 'J3', ticketIds: ['014'], state: 'waiting-for-answer', launchedAt: at('13:40:00')
  }),
  exampleAgentJob({
    id: 'J6', kind: 'review', role: 'reviewer', ticketIds: ['011'], launchedAt: at('14:13:08'), live: liveFactsWith(33_000)
  }),
];

function draftAttention(ticket: BoardTicketDocument): BoardAttentionEntryDocument {
  return {
    key:                     `ticket:${ticket.id}`,
    kind:                    'draft-ticket',
    idText:                  `#${ticket.id}`,
    ticketIds:               [],
    subject:                 ticket.title,
    jobId:                   null,
    askedBy:                 null,
    decisionKind:            null,
    escalatedFromIncidentId: null,
    metaText:                null,
    stamp:                   ticket.draft?.waitingSince ?? ticket.filed,
    stampWord:               'filed',
    actionLabel:             'Ready',
    target:                  { subject: 'ticket', id: ticket.id },
  };
}

function storefrontBoardOf(tickets: readonly BoardTicketDocument[], decisions: BoardDocument['decisions']): BoardDocument {
  const board = exampleTicketsBoard({
    tickets, epics: EPICS, jobs: JOBS, decisions, waitingOn: { '018': ['012'] }, displayStates: { '011': 'reviewing' },
  });
  return {
    ...board,
    project:   'Example Storefront',
    pipeline:  pipelineBoardStateOf('A5').pipeline,
    attention: tickets.filter((ticket) => ticket.draft !== undefined && ticket.draft.waitsOnUser !== null).map(draftAttention),
  };
}

const INTAKE_QUESTIONS: BoardDocument['decisions'] = [
  exampleAskingDecision({
    id: 'E5', jobId: 'J8', askedBy: 'product-owner', openedAt: at('14:12:00')
  }),
  exampleAskingDecision({
    id: 'E6', jobId: 'J8', askedBy: 'product-owner', openedAt: at('14:14:00')
  }),
];

const BUILDER_QUESTION = exampleAskingDecision({
  id: 'E2', jobId: 'J3', ticketIds: ['014'], openedAt: at('14:15:10')
});

/** The spec-then-plan route: the In draft, Active and Finished segments of the artboard. */
export const STOREFRONT_TICKETS_BOARD: BoardDocument = storefrontBoardOf(
  [...DRAFTS, ...ACTIVE, ...LATEST_FINISHED, ...EARLIER_FINISHED],
  [...INTAKE_QUESTIONS, BUILDER_QUESTION, exampleDocumentQuestion('E7', '022', 'spec', at('14:13:00')), exampleDocumentQuestion('E8', '022', 'spec', at('14:13:30'))],
);

/** The one-ticket route: the intake shapes each ticket, which then waits for User's review. */
export const STOREFRONT_ONE_TICKET_BOARD: BoardDocument = storefrontBoardOf(
  [
    exampleTicketsTicket('024', {
      title:      'Gift wrap option',
      status:     'ready-for-review',
      epics:      ['checkout'],
      filedByJob: 'J8',
      updated:    at('13:52:00'),
      draft:      exampleDraft({ stage: 'ticket-review', waitsOnUser: 'approval', waitingSince: at('13:52:00') }),
    }),
    exampleTicketsTicket('025', {
      title: 'Store pickup', status: 'draft', epics: ['checkout'], filedByJob: 'J8', filed: at('14:08:00')
    }),
    ...ACTIVE,
    ...LATEST_FINISHED,
    ...EARLIER_FINISHED,
  ],
  [...INTAKE_QUESTIONS, BUILDER_QUESTION],
);
