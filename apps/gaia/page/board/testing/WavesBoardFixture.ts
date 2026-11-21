/**
 * Small synthetic boards in the page's board contract holding exactly what the Waves tab reads, for its model and DOM specs: tickets with the
 * `settlesADependency` fact a forge serves for their status, their rows, the ready list, the slot limit and the epics. Test-only.
 */
import type { BoardDocument }                                                from '../../@types/board/BoardDocument.ts';
import type { BoardEpicDocument, BoardTaskDocument, BoardTicketDocument }    from '../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState, BoardHephaestusSetting, BoardTicketStatus } from '../../@types/board/BoardVocabulary.ts';
import {
  boardStateFixture,
  exampleTask,
  exampleTicket,
  ticketCountByStatusOf
} from './BoardStateFixture.ts';

/** The statuses a forge serves `settlesADependency` for, standing in for its fact. */
const STATUSES_THAT_SETTLE_A_DEPENDENCY: readonly BoardTicketStatus[] = ['reviewed', 'delivered'];

export function exampleWavesTask(id: number, fields: Partial<BoardTaskDocument> = {}): BoardTaskDocument {
  return exampleTask({
    id, name: `Example task ${String(id)}`, status: 'committed', ...fields
  });
}

/** A committed ticket, unless the fields say otherwise, with the forge's facts for its status. */
export function exampleWavesTicket(id: string, fields: Partial<BoardTicketDocument> = {}): BoardTicketDocument {
  const status = fields.status ?? 'committed';
  const ticket = exampleTicket({ id, title: `Example ticket ${id}`, ...fields });
  return { ...ticket, facts: { ...ticket.facts, settlesADependency: STATUSES_THAT_SETTLE_A_DEPENDENCY.includes(status) } };
}

export function exampleWavesEpic(key: string, fields: Partial<BoardEpicDocument> = {}): BoardEpicDocument {
  return {
    key, title: `Example epic ${key}`, slot: 0, ticketIds: [], ticketCountByStatus: ticketCountByStatusOf({}), tokens: 0, span: null, ...fields
  };
}

export interface ExampleWavesBoardFields {
  readonly tasks?:             readonly BoardTaskDocument[];
  readonly tickets?:           readonly BoardTicketDocument[];
  /** Each ticket's own row and review bars, by task id. */
  readonly ticketRows?:        Readonly<Record<string, { ownTaskId?: number; reviewTaskIds?: readonly number[] }>>;
  readonly displayStates?:     Readonly<Record<string, BoardDisplayState>>;
  readonly readyTicketIds?:    readonly string[];
  readonly concurrencyLimit?:  number;
  /** Paused unless said: the wave forecast is asked for only while Hephaestus runs. */
  readonly hephaestusSetting?: BoardHephaestusSetting;
  readonly epics?:             readonly BoardEpicDocument[];
}

export function exampleWavesBoard(fields: ExampleWavesBoardFields = {}): BoardDocument {
  const tasks = fields.tasks ?? [];
  const tickets = fields.tickets ?? [];
  const positionOf = (taskId: number | undefined): number | null => {
    const position = tasks.findIndex((task) => task.id === taskId);
    return position === -1 ? null : position;
  };
  const board = boardStateFixture();
  return boardStateFixture({
    concurrency: { ...board.concurrency, limit: fields.concurrencyLimit ?? 3 },
    page:        {
      ...board.page,
      progress: {
        ...board.page.progress, hephaestusSetting: fields.hephaestusSetting ?? 'paused', tasks, log: []
      },
      facts: {
        rows:    tasks.map((task) => ({ displayState: task.status, deliveredRowCountsAsReviewed: false, ownRowPositionOfReviewedTicket: null })),
        tickets: tickets.map((ticket) => ({
          ticketId:           ticket.id,
          ownRowPosition:     positionOf(fields.ticketRows?.[ticket.id]?.ownTaskId),
          reviewBarPositions: (fields.ticketRows?.[ticket.id]?.reviewTaskIds ?? []).flatMap((taskId) => positionOf(taskId) ?? []),
          displayState:       fields.displayStates?.[ticket.id] ?? ticket.status,
          waitingOnTicketIds: [],
          entity:             null,
          stage:              null,
        })),
        epics:        fields.epics ?? [],
        readyTickets: (fields.readyTicketIds ?? []).map((id) => ({ id, isHeld: false })),
        drafts:       [],
      },
      tickets,
    },
  });
}
