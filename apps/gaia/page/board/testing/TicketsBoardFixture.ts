/** Small synthetic boards in the page's board contract holding exactly what the Tickets view reads, for its model spec and DOM spec. Test-only. */
import type { BoardDocument } from '../../@types/board/BoardDocument.ts';
import type {
  BoardEpicDocument,
  BoardLogEntryDocument,
  BoardTaskDocument,
  BoardTicketDocument
} from '../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState, BoardTicketStatus } from '../../@types/board/BoardVocabulary.ts';
import {
  boardStateFixture,
  exampleTask,
  exampleTicket,
  ticketCountByStatusOf
} from './BoardStateFixture.ts';

/** A committed ticket filed on the example day; `priority` also sets the priority the forge resolves, unless `facts` is given. */
export function exampleTicketsTicket(id: string, fields: Partial<BoardTicketDocument> = {}): BoardTicketDocument {
  const base = exampleTicket({
    id,
    title:    `Example ticket ${id}`,
    updated:  '2026-09-18T09:00:00+02:00',
    filed:    '2026-09-18T09:00:00+02:00',
    bodyHtml: `<p>Body of example ticket ${id}.</p>`,
  });
  return {
    ...base,
    ...fields,
    facts: fields.facts ?? { ...base.facts, resolvedPriority: fields.priority ?? 'normal' },
  };
}

/** An example own row of a ticket, numbered by the row id. */
export function exampleTicketsRow(id: number, fields: Partial<BoardTaskDocument> = {}): BoardTaskDocument {
  return exampleTask({
    id, name: `Example row ${id}`, status: 'in-progress', ...fields
  });
}

/** An epic's roll-up counted from the board's tickets that name it, as the forge counts it. */
function exampleEpicRollup(key: string, title: string, slot: number, tickets: readonly BoardTicketDocument[]): BoardEpicDocument {
  const members = tickets.filter((ticket) => ticket.epics.includes(key));
  const counts: Partial<Record<BoardTicketStatus, number>> = {};
  for (const member of members) counts[member.status] = (counts[member.status] ?? 0) + 1;
  return {
    key, title, slot, ticketIds: members.map((member) => member.id), ticketCountByStatus: ticketCountByStatusOf(counts), tokens: 0, span: null
  };
}

export interface ExampleTicketsBoardFields {
  readonly tickets:        readonly BoardTicketDocument[];
  /** The display state the forge serves, where it differs from the stored status. */
  readonly displayStates?: Readonly<Record<string, BoardDisplayState>>;
  readonly waitingOn?:     Readonly<Record<string, readonly string[]>>;
  /** Each ticket's own row; its position in the list is its `ownRowPosition`. */
  readonly ownRows?:       Readonly<Record<string, BoardTaskDocument>>;
  readonly log?:           readonly BoardLogEntryDocument[];
  readonly withoutEpics?:  boolean;
}

export function exampleTicketsBoard(fields: ExampleTicketsBoardFields): BoardDocument {
  const board = boardStateFixture();
  const ownRowEntries = Object.entries(fields.ownRows ?? {});
  return {
    ...board,
    page: {
      ...board.page,
      progress: { ...board.page.progress, tasks: ownRowEntries.map(([, row]) => row), log: fields.log ?? [] },
      facts:    {
        ...board.page.facts,
        rows:    ownRowEntries.map(([, row]) => ({ displayState: row.status, deliveredRowCountsAsReviewed: false, ownRowPositionOfReviewedTicket: null })),
        tickets: fields.tickets.map((ticket) => {
          const position = ownRowEntries.findIndex(([ticketId]) => ticketId === ticket.id);
          return {
            ticketId:           ticket.id,
            ownRowPosition:     position === -1 ? null : position,
            reviewBarPositions: [],
            displayState:       fields.displayStates?.[ticket.id] ?? ticket.status,
            waitingOnTicketIds: fields.waitingOn?.[ticket.id] ?? [],
            entity:             null,
            stage:              null,
          };
        }),
        epics: fields.withoutEpics === true
          ? []
          : [exampleEpicRollup('billing', 'Example billing', 4, fields.tickets), exampleEpicRollup('checkout', 'Example checkout', 2, fields.tickets)],
      },
      tickets: fields.tickets,
    },
  };
}
