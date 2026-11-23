/*
 * Paints Example Storefront as a mature, busy board (synthetic data built with Gaia's own fixture helpers) in Gaia's shell,
 * the way its visual pass paints a screen, and writes one whole document per board tab.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';

import { createElement }        from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CommandSenderContext }                           from '../../../apps/gaia/page/api/CommandSender.ts';
import { exampleAgentJob, ticketCountByStatusOf }         from '../../../apps/gaia/page/board/testing/BoardStateFixture.ts';
import { productOwnerJob }                                from '../../../apps/gaia/page/board/testing/IntakeBoardFixture.ts';
import { exampleBoard, exampleFilingDraft, exampleTicket } from '../../../apps/gaia/page/board/testing/KanbanBoardFixture.ts';
import { HashRouter }                                     from '../../../apps/gaia/page/shared/HashRouter.ts';
import { GaiaShell, viewPartsOf }                         from '../../../apps/gaia/page/shell/GaiaApp.tsx';
import { documentAround }                                 from '../../../apps/gaia/page/testing/ArtboardScreens.tsx';
import { forgeViewSurroundingsAt, silentBoardServicesOf } from '../../../apps/gaia/page/testing/ShellSurroundingsAt.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../../apps/gaia/page/testing/fixtures/fleet-five-forges.ts';
import { storefrontBoardOf }                              from '../../../apps/gaia/page/testing/fixtures/storefront-board.ts';

const outputFolder = process.argv[2];
if (outputFolder === undefined) throw new Error('Give the output folder.');

const trackerId = FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront;
const storefront = storefrontBoardOf(trackerId);
const storefrontTicketOf = (ticketId: string) => {
  const ticket = storefront.page.tickets.find((candidate) => candidate.id === ticketId);
  if (ticket === undefined) throw new Error(`The storefront fixture has no ticket ${ticketId}.`);
  return ticket;
};

interface DeliveredWork { readonly id: string; readonly title: string; readonly epic: string; readonly size: 'S' | 'M' | 'L'; readonly day: string; readonly tokens: number; readonly type?: 'bug' }

const DELIVERED_WORK: readonly DeliveredWork[] = [
  { id: '001', title: 'Product catalogue page', epic: 'catalogue', size: 'L', day: '2026-11-03T15:42:00.000Z', tokens: 412000 },
  { id: '002', title: 'Basket and line items', epic: 'checkout', size: 'L', day: '2026-11-04T11:18:00.000Z', tokens: 388000 },
  { id: '003', title: 'Checkout address form', epic: 'checkout', size: 'M', day: '2026-11-05T09:51:00.000Z', tokens: 241000 },
  { id: '004', title: 'Card payment', epic: 'checkout', size: 'L', day: '2026-11-06T16:27:00.000Z', tokens: 455000 },
  { id: '005', title: 'Order confirmation email', epic: 'checkout', size: 'S', day: '2026-11-07T10:03:00.000Z', tokens: 126000 },
  { id: '006', title: 'Search by product name', epic: 'catalogue', size: 'M', day: '2026-11-09T14:36:00.000Z', tokens: 268000 },
  { id: '007', title: 'Category filters', epic: 'catalogue', size: 'M', day: '2026-11-10T09:12:00.000Z', tokens: 233000 },
  { id: '008', title: 'Guest checkout', epic: 'checkout', size: 'M', day: '2026-11-10T17:44:00.000Z', tokens: 297000 },
  { id: '009', title: 'Stock badge on product cards', epic: 'catalogue', size: 'S', day: '2026-11-11T11:29:00.000Z', tokens: 98000 },
  { id: '011', title: 'Basket survives sign-in', epic: 'account', size: 'S', day: '2026-11-12T09:40:00.000Z', tokens: 141000, type: 'bug' },
  { id: '010', title: 'Wishlist sharing', epic: 'account', size: 'M', day: '2026-11-12T13:05:00.000Z', tokens: 254000 },
];

const hoursBefore = (stamp: string, hours: number): string => new Date(Date.parse(stamp) - hours * 3600000).toISOString();

const deliveredTickets = DELIVERED_WORK.map((work) => exampleTicket(work.id, {
  title: work.title, status: 'delivered', epics: [work.epic], size: work.size, type: work.type ?? 'ticket',
  filed: hoursBefore(work.day, 30), updated: work.day, started: hoursBefore(work.day, 5), finished: hoursBefore(work.day, 2), delivered: work.day,
}));

const openTickets = [
  exampleTicket('012', { title: 'Delivery date estimate', status: 'in-review', epics: ['checkout'], size: 'M', filed: '2026-11-11T08:20:00.000Z', started: '2026-11-12T08:05:00.000Z', finished: '2026-11-12T11:40:00.000Z' }),
  exampleTicket('019', { title: 'Saved payment methods', status: 'in-review', epics: ['checkout'], size: 'L', priority: 'high', filed: '2026-11-11T09:02:00.000Z', started: '2026-11-12T07:30:00.000Z', finished: '2026-11-12T12:22:00.000Z' }),
  exampleTicket('017', { title: 'Returns request form', status: 'in-review', epics: ['account'], size: 'M', filed: '2026-11-11T13:10:00.000Z', started: '2026-11-12T09:15:00.000Z', finished: '2026-11-12T12:48:00.000Z' }),
  exampleTicket('018', { title: 'Gift message at checkout', status: 'in-review', epics: ['checkout'], size: 'S', filed: '2026-11-11T14:31:00.000Z', started: '2026-11-12T10:42:00.000Z', finished: '2026-11-12T13:02:00.000Z' }),
  exampleTicket('013', { title: 'Product image zoom', status: 'in-progress', epics: ['catalogue'], size: 'M', filed: '2026-11-11T15:00:00.000Z', started: '2026-11-12T12:31:00.000Z' }),
  { ...storefrontTicketOf('014'), epics: ['account'], size: 'M' as const, filed: '2026-11-11T16:12:00.000Z', started: '2026-11-12T13:09:50.000Z' },
  { ...storefrontTicketOf('016'), epics: ['account'], size: 'L' as const, filed: '2026-11-12T08:44:00.000Z', started: '2026-11-12T13:02:10.000Z' },
  exampleTicket('015', { title: 'Search suggestions', status: 'ready-for-review', epics: ['catalogue'], size: 'M', filed: '2026-11-12T11:15:00.000Z' }),
  exampleTicket('020', { title: 'Promo codes', epics: ['checkout'], size: 'L', priority: 'high', filed: '2026-11-12T09:20:00.000Z' }),
  exampleTicket('023', { title: 'Address autocomplete', epics: ['checkout'], size: 'S', filed: '2026-11-12T09:48:00.000Z' }),
  exampleTicket('021', { title: 'Product reviews', epics: ['catalogue'], size: 'L', filed: '2026-11-12T10:05:00.000Z' }),
  exampleTicket('022', { title: 'Back-in-stock email', epics: ['catalogue'], size: 'S', filed: '2026-11-12T10:30:00.000Z' }),
  exampleTicket('024', { title: 'Reorder from order history', epics: ['account'], size: 'M', dependsOn: ['016'], filed: '2026-11-12T10:52:00.000Z' }),
  exampleTicket('025', { title: 'Invoice download', type: 'ticket', epics: ['account'], size: 'S', dependsOn: ['016'], filed: '2026-11-12T11:40:00.000Z' }),
];

const tickets = [...deliveredTickets, ...openTickets];
const titleOf = (ticketId: string): string => tickets.find((ticket) => ticket.id === ticketId)?.title ?? '';
const rowNameOf = (ticketId: string): string => `#${ticketId} ${titleOf(ticketId)}`;

const ownRowsById = Object.fromEntries([
  ...DELIVERED_WORK.map((work) => [work.id, {
    name: rowNameOf(work.id), status: 'delivered' as const, start: hoursBefore(work.day, 5), end: work.day, tokens: work.tokens, reviewed: hoursBefore(work.day, 1), owner: 'builder',
  }]),
  ['012', { name: rowNameOf('012'), status: 'in-review' as const, start: '2026-11-12T08:05:00.000Z', end: '2026-11-12T11:40:00.000Z', tokens: 231000, reviewed: '2026-11-12T12:35:00.000Z', owner: 'builder' }],
  ['019', { name: rowNameOf('019'), status: 'in-review' as const, start: '2026-11-12T07:30:00.000Z', end: '2026-11-12T12:22:00.000Z', tokens: 402000, reviewed: '2026-11-12T13:10:00.000Z', owner: 'builder' }],
  ['017', { name: rowNameOf('017'), status: 'in-review' as const, start: '2026-11-12T09:15:00.000Z', end: '2026-11-12T12:48:00.000Z', tokens: 187000, owner: 'builder' }],
  ['018', { name: rowNameOf('018'), status: 'in-review' as const, start: '2026-11-12T10:42:00.000Z', end: '2026-11-12T13:02:00.000Z', tokens: 76000, owner: 'builder' }],
  ['013', { name: rowNameOf('013'), status: 'in-progress' as const, start: '2026-11-12T12:31:00.000Z', tokens: 118000, owner: 'builder' }],
  ['014', { name: rowNameOf('014'), status: 'in-progress' as const, start: '2026-11-12T13:09:50.000Z', tokens: 31000, owner: 'builder' }],
  ['016', { name: rowNameOf('016'), status: 'in-progress' as const, start: '2026-11-12T13:02:10.000Z', tokens: 64000, owner: 'builder' }],
]);

const kanbanBoard = exampleBoard({
  tickets,
  readyTicketIds:   ['020', '023', '021', '022', '024', '025'],
  queuedTicketIds:  ['012', '019'],
  filingDrafts:     [exampleFilingDraft({ id: 'D7', title: 'Loyalty points at checkout', openedAt: '2026-11-12T12:55:00.000Z', openQuestionCount: 2 })],
  waitingOn:        { '024': ['016'], '025': ['016'] },
  ownRowsById,
  reviewRowsById:   { '017': [{ name: 'Review of #017', status: 'in-progress', start: '2026-11-12T13:06:00.000Z', owner: 'reviewer' }] },
  displayStateById: { '017': 'reviewing' },
  decisions:        [{ id: 'E2', kind: 'agent-question', ticketIds: ['014'] }],
});

const EPIC_TITLES: Readonly<Record<string, { readonly title: string; readonly slot: number }>> = {
  checkout:  { title: 'Checkout', slot: 2 },
  catalogue: { title: 'Catalogue', slot: 4 },
  account:   { title: 'Customer account', slot: 3 },
};
const epics = Object.entries(EPIC_TITLES).map(([key, epic]) => {
  const epicTickets = tickets.filter((ticket) => ticket.epics.includes(key));
  const counts: Record<string, number> = {};
  epicTickets.forEach((ticket) => { counts[ticket.status] = (counts[ticket.status] ?? 0) + 1; });
  return { key, title: epic.title, slot: epic.slot, ticketIds: epicTickets.map((ticket) => ticket.id), ticketCountByStatus: ticketCountByStatusOf(counts), tokens: 0, span: null };
});

const lastToolCallOf = (toolName: string, startedAt: string, running: boolean) => ({ toolName, startedAt, running });
const subagentOf = (parentToolUseId: string, description: string, state: 'running' | 'ended', toolCalls: number, tokens: number, toolName: string) => ({
  parentToolUseId, description, state, toolCalls, tokens, lastToolCall: lastToolCallOf(toolName, '2026-11-12T13:18:40.000Z', state === 'running'),
});
const defaultLiveFacts = exampleAgentJob({ id: 'unused' }).live;
const liveFactsOf = (calls: number, callBudget: number, tokens: number, lastToolCall: ReturnType<typeof lastToolCallOf>, subagents: readonly ReturnType<typeof subagentOf>[] = []) => ({
  ...defaultLiveFacts,
  calls,
  callBudget,
  tokens,
  toolCalls:              Math.round(calls * 0.6),
  lastToolCall,
  subagents,
  toolCallsWithSubagents: Math.round(calls * 0.6) + subagents.reduce((total, subagent) => total + subagent.toolCalls, 0),
  turn:                   'mid-turn' as const,
});
const workerJobs = [
  {
    ...exampleAgentJob({ id: 'J2', ticketIds: ['013'], launchedAt: '2026-11-12T12:31:00.000Z' }),
    live: liveFactsOf(96, 150, 118000, lastToolCallOf('Edit', '2026-11-12T13:19:12.000Z', false), [
      subagentOf('toolu_gallery', 'Find where the product gallery renders', 'ended', 14, 22000, 'Grep'),
      subagentOf('toolu_zoom', 'Check the zoom lens on touch screens', 'running', 9, 15000, 'Read'),
    ]),
  },
  { ...exampleAgentJob({ id: 'J3', ticketIds: ['014'], launchedAt: '2026-11-12T13:09:50.000Z' }), live: liveFactsOf(22, 150, 31000, lastToolCallOf('AskUserQuestion', '2026-11-12T13:15:10.000Z', true)) },
  {
    ...exampleAgentJob({ id: 'J4', ticketIds: ['016'], launchedAt: '2026-11-12T13:02:10.000Z' }),
    live: liveFactsOf(41, 150, 64000, lastToolCallOf('Bash', '2026-11-12T13:19:21.000Z', true), [
      subagentOf('toolu_orders', 'Map the order tables and their indexes', 'ended', 11, 18000, 'Read'),
    ]),
  },
  { ...exampleAgentJob({ id: 'J6', kind: 'review', role: 'reviewer', ticketIds: ['017'], launchedAt: '2026-11-12T13:06:00.000Z' }), live: liveFactsOf(28, 75, 52000, lastToolCallOf('Read', '2026-11-12T13:19:02.000Z', false)) },
];
const intakeJobs = [
  productOwnerJob({ id: 'J8', state: 'running', launchedAt: '2026-11-12T13:11:00.000Z', intake: { text: 'Shoppers lose their basket when they switch devices', title: 'Baskets across devices' } }, {
    calls: 9, tokens: 14000, turn: 'mid-turn', lastToolCall: lastToolCallOf('Grep', '2026-11-12T13:19:05.000Z', true),
    lastLine: { role: 'assistant', text: 'Two questions before I file this: should a signed-out basket merge into the account basket, or replace it?', at: '2026-11-12T13:18:30.000Z' },
  }),
  productOwnerJob({ id: 'J7', state: 'running', launchedAt: '2026-11-12T12:55:00.000Z', intake: { text: 'Customers want to pay part of an order with loyalty points', title: 'Loyalty points at checkout' } }, {
    calls: 17, tokens: 26000, turn: 'between-turns',
    lastLine: { role: 'assistant', text: 'Draft D7 has two open questions for you.', at: '2026-11-12T13:02:00.000Z' },
  }),
];
const jobs = [...workerJobs, ...intakeJobs];

const busyBoard = {
  ...storefront,
  concurrency: { ...storefront.concurrency, limit: 5, agentsInFlight: workerJobs.length },
  launchSlots: { limit: 5, slotJobIds: workerJobs.map((job) => job.id), inProgressTicketIdsWithoutJob: [] },
  jobs,
  mergeQueue:  kanbanBoard.mergeQueue,
  page:        { ...kanbanBoard.page, facts: { ...kanbanBoard.page.facts, epics } },
  today:       { calendarDate: FLEET_FIXTURES_READ_AT.slice(0, 'yyyy-mm-dd'.length), deliveredTickets: 2, tokens: 1164000 },
};

const doNothing = (): void => undefined;
const silentSender = {
  send:                  () => Promise.reject(new Error('A painted screen sends no command.')),
  dismissFailure:        doNothing,
  dismissRestartPending: doNothing,
  dismissAnswer:         doNothing,
  states:                () => ({ forges: new Map(), fleet: new Map(), fleetAnswers: new Map() }),
  subscribe:             () => doNothing,
};

function boardDocumentOf(tab: string, theme: 'light' | 'dark'): string {
  const fleetDocument = { ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, theme } };
  const route = HashRouter.routeOf(HashRouter.fragmentOf({ view: 'forge', trackerId, boardRoute: { tab, item: null } } as never));
  const view = viewPartsOf(route, fleetDocument, {
    readAtMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT),
    timeZone:           'UTC',
    goTo:               doNothing,
    forgeView:          {
      ...forgeViewSurroundingsAt(),
      boardServicesOf:      (boardTrackerId: string) => (boardTrackerId === trackerId
        ? { ...silentBoardServicesOf(boardTrackerId), readingAtMount: { board: busyBoard, connection: 'live' as const } }
        : silentBoardServicesOf(boardTrackerId)),
      crashLogsReadAtMount: () => [],
    },
  } as never);
  const shell = createElement(GaiaShell, { fleetDocument, streamState: 'live', route, view, themeChoice: theme, onThemeChoice: doNothing } as never);
  const markup = renderToStaticMarkup(createElement(CommandSenderContext, { value: silentSender } as never, shell));
  return documentAround(`Example Storefront, ${tab}, ${theme}`, theme, `<div id="gaia-root">${markup}</div>`);
}

for (const tab of process.argv.slice(3)) {
  writeFileSync(join(outputFolder, `busy-${tab}-light.html`), boardDocumentOf(tab, 'light'));
  console.log(`busy board: ${tab}`);
}
