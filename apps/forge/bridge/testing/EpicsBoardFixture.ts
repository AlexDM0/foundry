/**
 * A synthetic `BoardState` holding exactly what the Epics view reads, for its model spec and DOM spec: an open checkout epic (one ticket
 * done this morning, one in progress, one waiting on it and also in billing), a billing epic whose ticket waits on checkout's, and an
 * archive epic that settled last week. Test-only.
 */
import type { EpicRollupDocument }                   from '../@types/BoardStateDocument.ts';
import type { EpicsBoardState, EpicsTicketDocument } from '../@types/EpicsBoardState.ts';
import { EXAMPLE_PAGE_LIMITS }                       from './TimestampSlicesFixture.ts';

export const EPICS_FIXTURE_NOW = new Date('2026-10-29T12:00:00');

export const PLANTED_EPIC_DESCRIPTION_HTML = '<p>Example summary</p><img src=x onerror="window.plantedRan = true"><script>window.plantedRan = true</script>'
  + '<a href="javascript:window.plantedRan = true">planted link</a>';

const EPICS_FIXTURE_TICKETS: readonly EpicsTicketDocument[] = [
  {
    id: '1', title: 'Example archived long ago', status: 'delivered', updated: '2026-10-20T10:00:00', delivered: '2026-10-20T10:00:00', abandonedAt: null, epics: ['archive']
  },
  {
    id: '2', title: 'Example delivered this morning', status: 'delivered', updated: '2026-10-29T09:00:00', delivered: '2026-10-29T09:00:00', abandonedAt: null, epics: ['checkout']
  },
  {
    id: '3', title: 'Example in progress', status: 'in-progress', updated: '2026-10-29T08:00:00', delivered: null, abandonedAt: null, epics: ['checkout']
  },
  {
    id: '4', title: 'Example waiting', status: 'committed', updated: '2026-10-28T08:00:00', delivered: null, abandonedAt: null, epics: ['checkout', 'billing'], dependsOn: ['3']
  },
  {
    id: '5', title: 'Example billing step', status: 'committed', updated: '2026-10-28T08:00:00', delivered: null, abandonedAt: null, epics: ['billing'], dependsOn: ['3']
  },
];

export const OPEN_FIXTURE_EPIC: EpicRollupDocument = {
  key:                 'checkout',
  title:               'Example checkout',
  slot:                1,
  ticketIds:           ['2', '3', '4'],
  ticketCountByStatus: { 'delivered': 1, 'in-progress': 1, 'committed': 1 },
  tokens:              12_400,
  span:                { start: '2026-10-28T08:00:00', end: null },
};

const BILLING_FIXTURE_EPIC: EpicRollupDocument = {
  key:                 'billing',
  title:               'Example billing',
  slot:                3,
  ticketIds:           ['4', '5'],
  ticketCountByStatus: { committed: 2 },
  tokens:              0,
  span:                null,
};

export const SETTLED_FIXTURE_EPIC: EpicRollupDocument = {
  key:                 'archive',
  title:               'Example archive',
  slot:                2,
  ticketIds:           ['1'],
  ticketCountByStatus: { delivered: 1 },
  tokens:              800,
  span:                { start: '2026-10-19T08:00:00', end: '2026-10-20T10:00:00' },
};

export function epicsBoardFixture(epics: readonly EpicRollupDocument[] = [SETTLED_FIXTURE_EPIC, OPEN_FIXTURE_EPIC, BILLING_FIXTURE_EPIC]): EpicsBoardState {
  return {
    page: {
      tickets: EPICS_FIXTURE_TICKETS,
      payload: {
        progress:         { tasks: [{ reviewRound: 2 }] },
        limits:           EXAMPLE_PAGE_LIMITS,
        concurrency:      { limit: 4 },
        epicDescriptions: [{ key: 'checkout', descriptionHtml: PLANTED_EPIC_DESCRIPTION_HTML }, { key: 'billing', descriptionHtml: '<p>Example billing summary</p>' }],
        boardFacts:       {
          epics,
          tickets: EPICS_FIXTURE_TICKETS.map((ticket) => ({ ticketId: ticket.id, ownRowPosition: null, displayState: ticket.status })),
        },
      },
    },
  };
}
