// Example Storefront's board for the README panels, agreeing with the five forges' fleet fixture: four agents of five, two entries
// waiting on User, three tickets landed today.
import { exampleAgentJob, exampleTask, exampleTicket, ticketCountByStatusOf } from '../apps/gaia/page/board/testing/BoardStateFixture.ts';
import { storefrontBoardOf }                                                from '../apps/gaia/page/testing/fixtures/storefront-board.ts';

const FIXTURE_DAY = '2026-11-12';

const stampAt = (clockTime: string, day: string = FIXTURE_DAY): string => `${day}T${clockTime}:00.000Z`;

const STATUSES_THAT_SETTLE_A_DEPENDENCY = ['reviewed', 'delivered'];
const STATUSES_NO_AGENT_HAS_PICKED_UP = ['draft', 'ready-for-review', 'committed'];
const STATUSES_WITH_A_ROW_OF_THEIR_OWN = ['in-progress', 'in-review', 'reviewed', 'delivered'];

interface StorefrontTicket {
  readonly id:            string;
  readonly title:         string;
  readonly status:        string;
  readonly displayState?: string;
  readonly type?:         string;
  readonly priority?:     string;
  readonly epic:          string;
  readonly filed:         string;
  readonly started?:      string;
  readonly finished?:     string;
  readonly delivered?:    string;
  readonly tokens?:       number;
  readonly waitingOn?:    readonly string[];
  readonly reviewBar?:    { readonly start: string; readonly end: string | null; readonly tokens: number };
}

const STOREFRONT_TICKETS: readonly StorefrontTicket[] = [
  {
    id: '008', title: 'Order history filters', status: 'delivered', epic: 'account', filed: stampAt('15:10', '2026-11-11'),
    started: stampAt('08:05'), finished: stampAt('09:40'), delivered: stampAt('10:57'), tokens: 148_300,
    reviewBar: { start: stampAt('09:46'), end: stampAt('10:31'), tokens: 61_200 },
  },
  {
    id: '009', title: 'Guest checkout', status: 'delivered', epic: 'checkout', filed: stampAt('15:22', '2026-11-11'),
    started: stampAt('08:20'), finished: stampAt('10:48'), delivered: stampAt('12:02'), tokens: 171_900,
    reviewBar: { start: stampAt('10:55'), end: stampAt('11:41'), tokens: 58_700 },
  },
  {
    id: '010', title: 'Wishlist sharing', status: 'delivered', epic: 'catalogue', filed: stampAt('16:02', '2026-11-11'),
    started: stampAt('09:55'), finished: stampAt('11:52'), delivered: stampAt('13:05'), tokens: 131_600,
    reviewBar: { start: stampAt('12:01'), end: stampAt('12:44'), tokens: 49_100 },
  },
  {
    id: '004', title: 'Orders CSV export', status: 'reviewed', epic: 'account', filed: stampAt('14:40', '2026-11-11'),
    started: stampAt('10:40'), finished: stampAt('12:21'), tokens: 96_400,
    reviewBar: { start: stampAt('12:30'), end: stampAt('13:11'), tokens: 44_800 },
  },
  {
    id: '011', title: 'Cart badge count', status: 'in-review', displayState: 'reviewing', type: 'bug', priority: 'high', epic: 'checkout',
    filed: stampAt('08:31'), started: stampAt('11:20'), finished: stampAt('13:04'), tokens: 88_900,
    reviewBar: { start: stampAt('13:13'), end: null, tokens: 96_700 },
  },
  {
    id: '006', title: 'Accent-blind search', status: 'in-review', epic: 'catalogue', filed: stampAt('16:30', '2026-11-11'),
    started: stampAt('11:48'), finished: stampAt('13:12'), tokens: 74_500,
  },
  {
    id: '012', title: 'Checkout address form', status: 'in-progress', epic: 'checkout', filed: stampAt('09:02'), started: stampAt('13:07'), tokens: 84_210,
  },
  {
    id: '014', title: 'Password reset flow', status: 'in-progress', priority: 'high', epic: 'account', filed: stampAt('09:40'), started: stampAt('13:09'), tokens: 51_900,
  },
  {
    id: '013', title: 'Product image zoom', status: 'in-progress', epic: 'catalogue', filed: stampAt('09:15'), started: stampAt('13:16'), tokens: 18_400,
  },
  { id: '016', title: 'Order history page', status: 'committed', epic: 'account', filed: stampAt('10:12') },
  { id: '017', title: 'Delivery estimate on the product page', status: 'committed', epic: 'catalogue', filed: stampAt('10:48') },
  { id: '018', title: 'Saved payment methods', status: 'committed', epic: 'checkout', filed: stampAt('11:05'), waitingOn: ['012'] },
  { id: '015', title: 'Search suggestions', status: 'draft', epic: 'catalogue', filed: stampAt('11:15') },
  {
    id: '019', title: 'CSV export writes dates in UTC instead of the shop\'s time zone', status: 'draft', type: 'bug', priority: 'low', epic: 'account',
    filed: stampAt('12:52'),
  },
];

const STOREFRONT_EPICS = [
  { key: 'checkout', title: 'Checkout redesign', slot: 2, start: stampAt('08:20') },
  { key: 'account', title: 'Customer account', slot: 4, start: stampAt('08:05') },
  { key: 'catalogue', title: 'Catalogue and search', slot: 6, start: stampAt('09:55') },
];

const displayStateOf = (ticket: StorefrontTicket): string => ticket.displayState ?? ticket.status;

const rowStatusOf = (ticket: StorefrontTicket): string => (STATUSES_WITH_A_ROW_OF_THEIR_OWN.includes(ticket.status) ? ticket.status : 'committed');

function liveFactsOf(jobId: string, calls: number, callBudget: number, tokens: number) {
  return { ...exampleAgentJob({ id: jobId }).live, calls, callBudget, tokens };
}

// The fixtures' builders are typed for Gaia's specs; this board is painted, never type-checked, so its documents pass as they are.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function richStorefrontBoard(trackerId: string): any {
  const small = storefrontBoardOf(trackerId);
  const ticketsWithRows = STOREFRONT_TICKETS.filter((ticket) => ticket.started !== undefined);
  const ownRows = ticketsWithRows.map((ticket, position) => exampleTask({
    id:     position + 1,
    name:   `#${ticket.id} ${ticket.title}`,
    status: rowStatusOf(ticket) as never,
    start:  ticket.started ?? null,
    end:    ticket.delivered ?? ticket.finished ?? null,
    ticket: ticket.id,
    tokens: ticket.tokens ?? null,
    owner:  'builder',
  }));
  const reviewedTickets = ticketsWithRows.filter((ticket) => ticket.reviewBar !== undefined);
  const reviewRows = reviewedTickets.map((ticket, position) => exampleTask({
    id:             ownRows.length + position + 1,
    name:           `Review of #${ticket.id}`,
    status:         ticket.reviewBar?.end === null ? 'in-progress' : 'delivered',
    start:          ticket.reviewBar?.start ?? null,
    end:            ticket.reviewBar?.end ?? null,
    tokens:         ticket.reviewBar?.tokens ?? null,
    reviewOf:       ticket.id,
    reviewBarRound: 1,
    owner:          'reviewer',
  }));
  const passwordResetTicketOfTheFixture = small.page.tickets.find((ticket) => ticket.id === '014');
  const smallPasswordResetTicket = {
    ...passwordResetTicketOfTheFixture,
    sections: (passwordResetTicketOfTheFixture?.sections ?? []).map((section) => (section.heading === 'Brief' ? { ...section, markdown: 'Work belongs in `src/account/**`.' } : section)),
  };
  // A path short enough for the option card: the fixture's own overflows it at this width.
  const decisions = small.decisions.map((decision) => ({
    ...decision,
    questions: decision.questions.map((question) => ({
      ...question,
      options: question.options.map((option) => (option.touches.length === 0 ? option : { ...option, touches: ['src/account/Reset.ts'] })),
    })),
  }));
  const tickets = STOREFRONT_TICKETS.map((ticket) => {
    const ownRowPosition = ticketsWithRows.indexOf(ticket);
    return exampleTicket({
      ...(ticket.id === '014' ? smallPasswordResetTicket : {}),
      id:        ticket.id,
      title:     ticket.title,
      type:      (ticket.type ?? 'ticket') as never,
      status:    ticket.status as never,
      priority:  (ticket.priority ?? null) as never,
      epics:     [ticket.epic],
      filed:     ticket.filed,
      updated:   ticket.delivered ?? ticket.finished ?? ticket.started ?? ticket.filed,
      started:   ticket.started ?? null,
      finished:  ticket.finished ?? null,
      delivered: ticket.delivered ?? null,
      task:      ownRowPosition === -1 ? null : ownRowPosition + 1,
      dependsOn: ticket.waitingOn ?? [],
      facts:     {
        resolvedPriority:     (ticket.priority ?? 'normal') as never,
        settlesADependency:   STATUSES_THAT_SETTLE_A_DEPENDENCY.includes(ticket.status),
        isClosed:             ticket.status === 'delivered',
        noAgentHasPickedItUp: STATUSES_NO_AGENT_HAS_PICKED_UP.includes(ticket.status),
        reviewRound:          ticket.reviewBar === undefined ? null : 1,
        isRepeatReview:       false,
      },
    });
  });
  const jobs = [
    exampleAgentJob({
      id: 'J2', ticketIds: ['012'], launchedAt: '2026-11-12T13:07:26.000Z', live: liveFactsOf('J2', 41, 120, 84_210)
    }),
    exampleAgentJob({
      id: 'J3', ticketIds: ['014'], state: 'waiting-for-answer', launchedAt: '2026-11-12T13:09:50.000Z', live: liveFactsOf('J3', 22, 120, 51_900)
    }),
    exampleAgentJob({
      id: 'J4', ticketIds: ['013'], launchedAt: '2026-11-12T13:16:20.000Z', live: liveFactsOf('J4', 9, 120, 18_400)
    }),
    exampleAgentJob({
      id: 'J6', kind: 'review', role: 'reviewer', ticketIds: ['011'], launchedAt: '2026-11-12T13:13:08.000Z', live: liveFactsOf('J6', 30, 80, 96_700)
    }),
  ];
  const epics = STOREFRONT_EPICS.map((epic) => {
    const epicTickets = STOREFRONT_TICKETS.filter((ticket) => ticket.epic === epic.key);
    const counts: Record<string, number> = {};
    for (const ticket of epicTickets) counts[ticket.status] = (counts[ticket.status] ?? 0) + 1;
    return {
      key:                 epic.key,
      title:               epic.title,
      slot:                epic.slot,
      ticketIds:           epicTickets.map((ticket) => ticket.id),
      ticketCountByStatus: ticketCountByStatusOf(counts),
      tokens:              epicTickets.reduce((total, ticket) => total + (ticket.tokens ?? 0) + (ticket.reviewBar?.tokens ?? 0), 0),
      span:                { start: epic.start, end: null },
    };
  });
  return {
    ...small,
    concurrency: { limit: 5, agentsInFlight: jobs.length },
    launchSlots: { limit: 5, slotJobIds: jobs.map((job) => job.id), inProgressTicketIdsWithoutJob: [] },
    jobs,
    decisions,
    attention:   [
      ...small.attention,
      {
        key:                     'ticket:015',
        kind:                    'draft-ticket',
        idText:                  '#015',
        ticketIds:               ['015'],
        subject:                 'Search suggestions',
        jobId:                   null,
        askedBy:                 null,
        decisionKind:            null,
        escalatedFromIncidentId: null,
        metaText:                'filed by intake',
        stamp:                   stampAt('11:15'),
        stampWord:               'filed',
        actionLabel:             'Ready',
        target:                  { subject: 'ticket', id: '015' },
      },
    ],
    mergeQueue: {
      queuedTicketIds: ['004'],
      targets:         [{
        target: 'main', holder: null, order: ['004'], waitingForMerge: [], pairwiseConflicts: [], targetMovedDecisionIds: []
      }],
    },
    page: {
      ...small.page,
      progress:         { ...small.page.progress, startedAt: stampAt('08:00'), tasks: [...ownRows, ...reviewRows] },
      epicDescriptions: STOREFRONT_EPICS.map((epic) => ({ key: epic.key, descriptionHtml: '' })),
      tickets,
      facts:            {
        ...small.page.facts,
        rows: [
          ...ticketsWithRows.map((ticket) => ({
            displayState: displayStateOf(ticket), deliveredRowCountsAsReviewed: ticket.status === 'delivered', ownRowPositionOfReviewedTicket: null
          })),
          ...reviewedTickets.map((ticket) => ({
            displayState:                   ticket.reviewBar?.end === null ? 'in-progress' : 'delivered',
            deliveredRowCountsAsReviewed:   false,
            ownRowPositionOfReviewedTicket: ticketsWithRows.indexOf(ticket),
          })),
        ],
        tickets: STOREFRONT_TICKETS.map((ticket) => {
          const ownRowPosition = ticketsWithRows.indexOf(ticket);
          const reviewPosition = reviewedTickets.indexOf(ticket);
          return {
            ticketId:           ticket.id,
            ownRowPosition:     ownRowPosition === -1 ? null : ownRowPosition,
            reviewBarPositions: reviewPosition === -1 ? [] : [ownRows.length + reviewPosition],
            displayState:       displayStateOf(ticket),
            waitingOnTicketIds: ticket.waitingOn ?? [],
            entity:             null,
            stage:              null,
          };
        }),
        epics,
        readyTickets: [{ id: '016', isHeld: false }, { id: '017', isHeld: false }],
        drafts:       [],
      },
    },
    today: { calendarDate: FIXTURE_DAY, deliveredTickets: 3, tokens: 512_000 },
  };
}
