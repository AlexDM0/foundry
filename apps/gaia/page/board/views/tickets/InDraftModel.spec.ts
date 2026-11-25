/**
 * The In draft segment's model. What matters: a draft that waits on User is a waiting row whose wait and action follow what the forge says
 * waits (an answer opens the document's questions, a proposal or an approval opens the document) and whose track marks User's stage; a
 * draft nobody waits on is an agent's row with its agent and Watch, or "no agent yet"; on the one-ticket route a ticket in review is a
 * waiting row with "Review ticket" and a Shape → Ticket review track, and a draft waits to be made ready; a filing draft waits on its
 * questions; the waiting rows run oldest wait first; the running intakes come with their drafts and questions; and the segment waits on
 * User while a row or an intake's question does. The search narrows the draft rows, never the intakes.
 */
import { describe, expect, test } from 'bun:test';

import { FIXTURE_NOW }          from '../../testing/BoardStateFixture.ts';
import { productOwnerJob }      from '../../testing/IntakeBoardFixture.ts';
import { EXAMPLE_BOARD_LIMITS } from '../../testing/PageLimitsFixture.ts';
import {
  exampleDocumentQuestion,
  exampleDocumentsSummary,
  exampleDraft,
  exampleFilingDraft,
  exampleTicketsBoard,
  exampleTicketsTicket
} from '../../testing/TicketsBoardFixture.ts';
import { InDraftModelUtil } from './InDraftModel.ts';
import type { RowMoment }   from './TicketRowFactsUtil.ts';

const MOMENT: RowMoment = { nowEpochMilliseconds: FIXTURE_NOW.getTime(), slices: EXAMPLE_BOARD_LIMITS };

const ANSWERING = exampleTicketsTicket('22', {
  title:      'Order email footer links',
  status:     'draft',
  epics:      ['billing'],
  filedByJob: 'J5',
  documents:  exampleDocumentsSummary(['drafting', 2]),
  draft:      exampleDraft({ stage: 'spec', waitsOnUser: 'answer', waitingSince: '2026-10-29T11:54:00' }),
});

const APPROVING = exampleTicketsTicket('21', {
  title:     'Saved addresses list',
  status:    'draft',
  documents: exampleDocumentsSummary(['awaiting-review', 3]),
  draft:     exampleDraft({ stage: 'spec-review', waitsOnUser: 'approval', waitingSince: '2026-10-29T10:05:00' }),
});

const PLAN_APPROVING = exampleTicketsTicket('19', {
  title:     'Dark mode toggle in account',
  status:    'draft',
  documents: exampleDocumentsSummary(['approved', 2], ['awaiting-review', 1]),
  draft:     exampleDraft({ stage: 'plan-review', waitsOnUser: 'approval', waitingSince: '2026-10-29T09:48:00' }),
});

const WRITTEN = exampleTicketsTicket('23', {
  title:     'Address autocomplete',
  status:    'draft',
  documents: exampleDocumentsSummary(['drafting', 1]),
  draft:     exampleDraft({
    stage: 'spec',
    agent: {
      jobId: 'J9', role: 'spec-agent', tokens: 18_000, since: '2026-10-29T11:55:48'
    }
  }),
});

const QUEUED = exampleTicketsTicket('20', {
  title:     'Invoice PDF download',
  status:    'draft',
  documents: exampleDocumentsSummary(['approved', 2]),
  draft:     exampleDraft({ stage: 'plan' }),
});

const SPEC_THEN_PLAN_BOARD = exampleTicketsBoard({
  tickets:   [ANSWERING, APPROVING, PLAN_APPROVING, WRITTEN, QUEUED, exampleTicketsTicket('12', { status: 'in-progress' })],
  decisions: [exampleDocumentQuestion('E7', '22', 'spec', '2026-10-29T11:54:00'), exampleDocumentQuestion('E8', '22', 'spec', '2026-10-29T11:56:00')],
});

describe('drafts that wait on User', () => {
  const model = InDraftModelUtil.inDraftModelOf(SPEC_THEN_PLAN_BOARD, MOMENT, '');

  test('run oldest wait first, with what waits and the action that answers it', () => {
    expect(model.waiting.map((row) => [row.idText, row.waitsText, row.actionLabel])).toEqual([
      ['#19', 'Approve plan v1', 'Open plan'],
      ['#21', 'Approve spec v3', 'Open spec'],
      ['#22', '2 questions from the spec agent', 'Answer'],
    ]);
  });

  test('every action opens the document being written, which the id opens too', () => {
    expect(model.waiting.map((row) => [row.actionRoute, row.openRoute === row.actionRoute])).toEqual([
      [{ tab: 'documents', item: 'ticket/19/plan' }, true],
      [{ tab: 'documents', item: 'ticket/21/spec' }, true],
      [{ tab: 'documents', item: 'ticket/22/spec' }, true],
    ]);
  });

  test('the track marks the stage that waits on User and checks the done ones', () => {
    expect(model.waiting.map((row) => row.steps.map((step) => `${step.label}:${step.status}`))).toEqual([
      ['✓ Spec:done', 'Plan:user'],
      ['Spec:user', 'Plan:upcoming'],
      ['Spec:user', 'Plan:upcoming'],
    ]);
  });

  test('a wait under an hour reads as its age, an older one as the stamp it began at', () => {
    expect(model.waiting.map((row) => row.sinceText)).toEqual(['09:48', '10:05', '6m']);
  });

  test('a row names its epic and the job that filed it', () => {
    const answering = model.waiting.find((row) => row.idText === '#22');
    expect([answering?.epic, answering?.originText]).toEqual([{ title: 'Example billing', slot: 4 }, 'from J5']);
  });
});

describe('drafts an agent writes', () => {
  const model = InDraftModelUtil.inDraftModelOf(SPEC_THEN_PLAN_BOARD, MOMENT, '');

  test('show their agent, its role and tokens, how long it has run, and Watch the document it writes', () => {
    const written = model.writing.find((row) => row.idText === '#23');
    expect([written?.agent, written?.sinceText, written?.watchRoute]).toEqual([
      {
        jobId: 'J9', roleText: 'spec agent', tokensText: '18k tokens', dotState: 'in-progress'
      },
      '4m 12s',
      { tab: 'documents', item: 'ticket/23/spec' },
    ]);
  });

  test('a draft with no agent yet has nothing to watch, and its track has the agent\'s stage next', () => {
    const queued = model.writing.find((row) => row.idText === '#20');
    expect([queued?.agent, queued?.watchRoute, queued?.steps.map((step) => step.status)]).toEqual([null, null, ['done', 'agent']]);
  });

  test('only drafts count, and the segment waits on User', () => {
    expect([model.draftCount, model.waitsOnUser, model.writing.map((row) => row.idText)]).toEqual([5, true, ['#23', '#20']]);
  });
});

describe('the one-ticket route and filing drafts', () => {
  const board = exampleTicketsBoard({
    tickets: [
      exampleTicketsTicket('24', {
        title:   'Gift wrap option',
        status:  'ready-for-review',
        updated: '2026-10-29T11:30:00',
        draft:   exampleDraft({ stage: 'ticket-review', waitsOnUser: 'approval', waitingSince: '2026-10-29T11:30:00' }),
      }),
      exampleTicketsTicket('25', { title: 'Store pickup', status: 'draft', filed: '2026-10-29T11:40:00' }),
    ],
    filingDrafts: [exampleFilingDraft('D7', { openQuestionCount: 2, openedAt: '2026-10-29T08:00:00' }), exampleFilingDraft('D8', { state: 'researching', claimOwner: 'J4' })],
  });
  const model = InDraftModelUtil.inDraftModelOf(board, MOMENT, '');

  test('a ticket in review waits with Review ticket on a Shape then Ticket review track, opening its detail', () => {
    const review = model.waiting.find((row) => row.idText === '#24');
    expect([review?.waitsText, review?.actionLabel, review?.steps.map((step) => step.label), review?.actionRoute])
      .toEqual(['Ticket to review', 'Review ticket', ['✓ Shape', 'Ticket review'], { tab: 'tickets', item: 'ticket/24' }]);
  });

  test('a draft of the one-ticket route waits to be made ready, from its detail', () => {
    const draft = model.waiting.find((row) => row.idText === '#25');
    expect([draft?.waitsText, draft?.actionLabel, draft?.actionRoute, draft?.sinceText])
      .toEqual(['Draft to make ready', 'Open ticket', { tab: 'tickets', item: 'ticket/25' }, '20m']);
  });

  test('a filing draft waits on its questions from its detail, and one being researched shows who has it', () => {
    const waiting = model.waiting.find((row) => row.idText === 'D7');
    const researched = model.writing.find((row) => row.idText === 'D8');
    expect([waiting?.waitsText, waiting?.actionRoute, waiting?.ticketId, researched?.agent?.jobId])
      .toEqual(['2 questions to answer', { tab: 'tickets', item: 'draft/D7' }, null, 'J4']);
  });

  test('a ticket in review on the spec-then-plan route keeps its spec and plan checked before Ticket review', () => {
    const inReview = exampleTicketsTicket('26', {
      status:    'ready-for-review',
      documents: exampleDocumentsSummary(['approved', 2], ['approved', 1]),
      draft:     exampleDraft({ stage: 'ticket-review', waitsOnUser: 'approval' }),
    });
    const reviewed = exampleTicketsBoard({ tickets: [inReview] });
    expect(InDraftModelUtil.inDraftModelOf(reviewed, MOMENT, '').waiting[0]?.steps.map((step) => step.label)).toEqual(['✓ Spec', '✓ Plan', 'Ticket review']);
  });
});

describe('running intakes', () => {
  const board = exampleTicketsBoard({
    tickets: [exampleTicketsTicket('30', { status: 'draft', filedByJob: 'J8' })],
    jobs:    [productOwnerJob({
      id: 'J8', state: 'running', intake: { text: 'Account area changes', title: 'Account area changes' }, launchedAt: '2026-10-29T11:51:00'
    })],
    decisions: [exampleDocumentQuestion('E5', '30', 'spec', '2026-10-29T11:52:00')].map((decision) => ({ ...decision, document: null, jobId: 'J8' })),
  });
  const model = InDraftModelUtil.inDraftModelOf(board, MOMENT, '');

  test('each shows its title, its drafts, how long it has run and its open questions, linking to its session', () => {
    expect(model.intakes).toEqual([{
      jobId:         'J8',
      title:         'Account area changes',
      draftsText:    '1 draft',
      runningText:   'running for 9m',
      questionCount: 1,
      waitsText:     'Waiting on you · 1 question',
      route:         { tab: 'intake', item: 'J8' },
    }]);
  });

  test('stay while a search narrows the draft rows away', () => {
    const searched = InDraftModelUtil.inDraftModelOf(board, MOMENT, 'nothing like it');
    expect([searched.intakes.length, searched.waiting.length, searched.writing.length]).toEqual([1, 0, 0]);
  });

  test('an intake\'s question alone makes the segment wait on User', () => {
    const onlyIntake = { ...board, page: { ...board.page, tickets: [] } };
    expect(InDraftModelUtil.inDraftModelOf(onlyIntake, MOMENT, '').waitsOnUser).toBe(true);
  });
});

test('a search narrows the draft rows by id or words', () => {
  expect([
    InDraftModelUtil.inDraftModelOf(SPEC_THEN_PLAN_BOARD, MOMENT, '21').waiting.map((row) => row.idText),
    InDraftModelUtil.inDraftModelOf(SPEC_THEN_PLAN_BOARD, MOMENT, 'autocomplete').writing.map((row) => row.idText),
  ]).toEqual([['#21'], ['#23']]);
});
