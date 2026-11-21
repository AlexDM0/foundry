/**
 * A synthetic board in the page's board contract holding exactly what the Epics view reads, for its model spec and DOM spec: an open
 * checkout epic (one ticket done this morning, one in progress, one waiting on it and also in billing), a billing epic whose ticket waits on
 * checkout's, and an archive epic that settled last week. The in-progress ticket's served review round is 3. Test-only.
 */
import type { BoardDocument }                          from '../../@types/board/BoardDocument.ts';
import type { BoardEpicDocument, BoardTicketDocument } from '../../@types/board/BoardTicketDocuments.ts';
import {
  boardStateFixture,
  examplePageTicketFacts,
  exampleTicket,
  ticketCountByStatusOf
} from './BoardStateFixture.ts';

export const EPICS_FIXTURE_NOW = new Date('2026-10-29T12:00:00');

export const PLANTED_EPIC_DESCRIPTION_HTML = '<p>Example summary</p><img src="x" onerror="window.plantedRan = true"><script>window.plantedRan = true</script>'
  + '<a href="javascript:window.plantedRan = true">planted link</a>';

/** A delivered ticket's facts as the forge serves them: closed, settling what depends on it. */
const DELIVERED_TICKET_FACTS: BoardTicketDocument['facts'] = {
  resolvedPriority: 'normal', settlesADependency: true, isClosed: true, noAgentHasPickedItUp: false, reviewRound: null, isRepeatReview: false
};

const EPICS_FIXTURE_TICKETS: readonly BoardTicketDocument[] = [
  exampleTicket({
    id:        '1',
    title:     'Example archived long ago',
    status:    'delivered',
    updated:   '2026-10-20T10:00:00',
    delivered: '2026-10-20T10:00:00',
    epics:     ['archive'],
    facts:     DELIVERED_TICKET_FACTS,
  }),
  exampleTicket({
    id:        '2',
    title:     'Example delivered this morning',
    status:    'delivered',
    updated:   '2026-10-29T09:00:00',
    delivered: '2026-10-29T09:00:00',
    epics:     ['checkout'],
    facts:     DELIVERED_TICKET_FACTS,
  }),
  exampleTicket({
    id:      '3',
    title:   'Example in progress',
    status:  'in-progress',
    updated: '2026-10-29T08:00:00',
    epics:   ['checkout'],
    facts:   {
      resolvedPriority: 'normal', settlesADependency: false, isClosed: false, noAgentHasPickedItUp: false, reviewRound: 3, isRepeatReview: false
    },
  }),
  exampleTicket({
    id: '4', title: 'Example waiting', status: 'committed', updated: '2026-10-28T08:00:00', epics: ['checkout', 'billing'], dependsOn: ['3']
  }),
  exampleTicket({
    id: '5', title: 'Example billing step', status: 'committed', updated: '2026-10-28T08:00:00', epics: ['billing'], dependsOn: ['3']
  }),
];

export const OPEN_FIXTURE_EPIC: BoardEpicDocument = {
  key:                 'checkout',
  title:               'Example checkout',
  slot:                1,
  ticketIds:           ['2', '3', '4'],
  ticketCountByStatus: ticketCountByStatusOf({ 'delivered': 1, 'in-progress': 1, 'committed': 1 }),
  tokens:              12_400,
  span:                { start: '2026-10-28T08:00:00', end: null },
};

const BILLING_FIXTURE_EPIC: BoardEpicDocument = {
  key:                 'billing',
  title:               'Example billing',
  slot:                3,
  ticketIds:           ['4', '5'],
  ticketCountByStatus: ticketCountByStatusOf({ committed: 2 }),
  tokens:              0,
  span:                null,
};

export const SETTLED_FIXTURE_EPIC: BoardEpicDocument = {
  key:                 'archive',
  title:               'Example archive',
  slot:                2,
  ticketIds:           ['1'],
  ticketCountByStatus: ticketCountByStatusOf({ delivered: 1 }),
  tokens:              800,
  span:                { start: '2026-10-19T08:00:00', end: '2026-10-20T10:00:00' },
};

export function epicsBoardFixture(epics: readonly BoardEpicDocument[] = [SETTLED_FIXTURE_EPIC, OPEN_FIXTURE_EPIC, BILLING_FIXTURE_EPIC]): BoardDocument {
  const board = boardStateFixture();
  return {
    ...board,
    page: {
      ...board.page,
      epicDescriptions: [{ key: 'checkout', descriptionHtml: PLANTED_EPIC_DESCRIPTION_HTML }, { key: 'billing', descriptionHtml: '<p>Example billing summary</p>' }],
      facts:            { ...board.page.facts, epics, tickets: EPICS_FIXTURE_TICKETS.map(examplePageTicketFacts) },
      tickets:          EPICS_FIXTURE_TICKETS,
    },
  };
}
