/** Small synthetic `BoardState`s holding exactly what the Tickets view and the detail panel read, for their model specs and DOM specs. */
import type { DisplayState }       from '../../src/lib/tracker-model/@types/Task.ts';
import type { EpicRollupDocument } from '../@types/BoardStateDocument.ts';
import type {
  TicketsBoardState,
  TicketsLogEntry,
  TicketsTaskDocument,
  TicketsTicketDocument
} from '../@types/TicketsBoardState.ts';
import { EXAMPLE_PAGE_LIMITS } from './TimestampSlicesFixture.ts';

export function exampleTicketsTicket(id: string, fields: Partial<TicketsTicketDocument> = {}): TicketsTicketDocument {
  return {
    id,
    title:       `Example ticket ${id}`,
    type:        'ticket',
    status:      'pending',
    updated:     '2026-09-18T09:00:00+02:00',
    task:        null,
    filed:       '2026-09-18T09:00:00+02:00',
    started:     null,
    finished:    null,
    delivered:   null,
    abandonedAt: null,
    bodyHtml:    `<p>Body of example ticket ${id}.</p>`,
    ...fields,
  };
}

/** An epic's roll-up counted from the board's tickets that name it, as the Board counts it. */
function exampleEpicRollup(key: string, title: string, slot: number, tickets: readonly TicketsTicketDocument[]): EpicRollupDocument {
  const members = tickets.filter((ticket) => ticket.epics?.includes(key) === true);
  const ticketCountByStatus: Record<string, number> = {};
  for (const member of members) ticketCountByStatus[member.status] = (ticketCountByStatus[member.status] ?? 0) + 1;
  return {
    key, title, slot, ticketIds: members.map((member) => member.id), ticketCountByStatus, tokens: 0, span: null
  };
}

export interface ExampleTicketsBoardFields {
  readonly tickets:        readonly TicketsTicketDocument[];
  /** The display state the Board reports, where it differs from the stored status. */
  readonly displayStates?: Readonly<Record<string, DisplayState>>;
  readonly waitingOn?:     Readonly<Record<string, readonly string[]>>;
  /** Each ticket's own row; its position in the list is its `ownRowPosition`. */
  readonly ownRows?:       Readonly<Record<string, TicketsTaskDocument>>;
  readonly log?:           readonly TicketsLogEntry[];
  readonly withoutEpics?:  boolean;
}

export function exampleTicketsBoard(fields: ExampleTicketsBoardFields): TicketsBoardState {
  const ownRowEntries = Object.entries(fields.ownRows ?? {});
  return {
    page: {
      tickets: fields.tickets,
      payload: {
        progress:   { tasks: ownRowEntries.map(([, row]) => row), log: fields.log ?? [] },
        limits:     EXAMPLE_PAGE_LIMITS,
        boardFacts: {
          tickets: fields.tickets.map((ticket) => {
            const position = ownRowEntries.findIndex(([ticketId]) => ticketId === ticket.id);
            return {
              ticketId:           ticket.id,
              ownRowPosition:     position === -1 ? null : position,
              displayState:       fields.displayStates?.[ticket.id] ?? ticket.status,
              waitingOnTicketIds: fields.waitingOn?.[ticket.id] ?? [],
            };
          }),
          epics: fields.withoutEpics === true
            ? []
            : [exampleEpicRollup('billing', 'Example billing', 4, fields.tickets), exampleEpicRollup('checkout', 'Example checkout', 2, fields.tickets)],
        },
      },
    },
  };
}
