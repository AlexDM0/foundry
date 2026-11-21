/** Small synthetic boards in the page's board contract holding what the Progress chart reads, for its model specs and DOM specs. Test-only. */
import type { BoardDocument } from '../../@types/board/BoardDocument.ts';
import type {
  BoardEpicDocument,
  BoardRowFactsDocument,
  BoardTaskDocument,
  BoardTicketDocument,
  BoardViewRangeDocument
} from '../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState }                                  from '../../@types/board/BoardVocabulary.ts';
import { boardStateFixture, exampleTicket, ticketCountByStatusOf } from './BoardStateFixture.ts';

export const EXAMPLE_STARTED_AT = '2026-09-18T09:00:00+02:00';

export function exampleProgressTask(id: number, fields: Partial<BoardTaskDocument> = {}): BoardTaskDocument {
  return {
    id,
    name:           `Example task ${id}`,
    status:         'committed',
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
    ...fields,
  };
}

export function exampleProgressTicket(id: string, fields: Partial<BoardTicketDocument> = {}): BoardTicketDocument {
  return exampleTicket({
    id, title: `Example ticket ${id}`, updated: '2026-09-18T08:00:00+02:00', ...fields
  });
}

export function exampleProgressEpic(key: string, fields: Partial<BoardEpicDocument> = {}): BoardEpicDocument {
  return {
    key, title: `Example epic ${key}`, slot: 0, ticketIds: [], ticketCountByStatus: ticketCountByStatusOf({}), tokens: 0, span: null, ...fields
  };
}

export interface ExampleProgressBoardFields {
  readonly tasks?:            readonly BoardTaskDocument[];
  /** The forge's facts per row, by task id; a row left out is no review bar and shows its stored status. */
  readonly rowFacts?:         Readonly<Record<number, Partial<Omit<BoardRowFactsDocument, 'ownRowPositionOfReviewedTicket'>> & { reviewsTaskId?: number }>>;
  readonly tickets?:          readonly BoardTicketDocument[];
  /** Each ticket's own row and review bars, by task id. */
  readonly ticketRows?:       Readonly<Record<string, { ownTaskId?: number; reviewTaskIds?: readonly number[] }>>;
  readonly displayStates?:    Readonly<Record<string, BoardDisplayState>>;
  readonly waitingOn?:        Readonly<Record<string, readonly string[]>>;
  readonly readyTicketIds?:   readonly string[];
  readonly concurrencyLimit?: number;
  /** Empty when left out: the rows are drawn ungrouped. */
  readonly epics?:            readonly BoardEpicDocument[];
  /** The tracker's own range, as the `range` command sets it; Fit when left out. */
  readonly view?:             BoardViewRangeDocument;
}

export function exampleProgressBoard(fields: ExampleProgressBoardFields = {}): BoardDocument {
  const tasks = fields.tasks ?? [];
  const tickets = fields.tickets ?? [];
  const positionOf = (taskId: number | undefined): number | null => {
    const position = tasks.findIndex((task) => task.id === taskId);
    return position === -1 ? null : position;
  };
  const base = boardStateFixture();
  return boardStateFixture({
    concurrency: { ...base.concurrency, limit: fields.concurrencyLimit ?? 3 },
    page:        {
      ...base.page,
      tickets,
      progress: {
        ...base.page.progress, startedAt: EXAMPLE_STARTED_AT, view: fields.view ?? { kind: 'auto' }, tasks
      },
      facts: {
        ...base.page.facts,
        rows: tasks.map((task) => {
          const facts = fields.rowFacts?.[task.id];
          return {
            displayState:                   facts?.displayState ?? task.status,
            deliveredRowCountsAsReviewed:   facts?.deliveredRowCountsAsReviewed ?? false,
            ownRowPositionOfReviewedTicket: positionOf(facts?.reviewsTaskId),
          };
        }),
        tickets: tickets.map((ticket) => ({
          ticketId:           ticket.id,
          ownRowPosition:     positionOf(fields.ticketRows?.[ticket.id]?.ownTaskId),
          reviewBarPositions: (fields.ticketRows?.[ticket.id]?.reviewTaskIds ?? []).flatMap((taskId) => positionOf(taskId) ?? []),
          displayState:       fields.displayStates?.[ticket.id] ?? ticket.status,
          waitingOnTicketIds: fields.waitingOn?.[ticket.id] ?? [],
          entity:             null,
          stage:              null,
        })),
        readyTickets: (fields.readyTicketIds ?? []).map((id) => ({ id, isHeld: false })),
        epics:        fields.epics ?? [],
      },
    },
  });
}
