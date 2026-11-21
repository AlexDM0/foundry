/**
 * Small synthetic boards in the page's board contract for the detail panel's model and DOM specs, each ticket carrying the offers a forge
 * serves today for its status and hold, and each job its stop holds and offers. Test-only.
 */
import type { BoardDocument }                                                           from '../../@types/board/BoardDocument.ts';
import type { BoardIncidentDocument }                                                   from '../../@types/board/BoardIncidentDocument.ts';
import type { BoardJobDocument, BoardMergeTargetDocument, BoardTicketForecastDocument } from '../../@types/board/BoardJobDocuments.ts';
import type {
  BoardDraftRequestDocument,
  BoardEpicDocument,
  BoardFilingDraftDocument,
  BoardLogEntryDocument,
  BoardTaskDocument,
  BoardTicketDocument,
  BoardTicketOffersDocument
} from '../../@types/board/BoardTicketDocuments.ts';
import type {
  BoardDisplayState,
  BoardOfferedCommandKind,
  BoardTicketPriority,
  BoardTicketStatus
} from '../../@types/board/BoardVocabulary.ts';
import type { DetailFormat } from '../views/detail-panel/DetailFactsModel.ts';
import {
  boardStateFixture,
  exampleAgentJob,
  exampleTask,
  exampleTicket,
  ticketCountByStatusOf
} from './BoardStateFixture.ts';
import { EXAMPLE_BOARD_LIMITS } from './PageLimitsFixture.ts';

export const EXAMPLE_TODAY = '2026-09-18';

export const EXAMPLE_NOW_EPOCH_MILLISECONDS = Date.parse('2026-09-18T13:36:00+02:00');

export const EXAMPLE_DETAIL_FORMAT: DetailFormat = Object.freeze({
  todayCalendarDate:    EXAMPLE_TODAY,
  nowEpochMilliseconds: EXAMPLE_NOW_EPOCH_MILLISECONDS,
  limits:               EXAMPLE_BOARD_LIMITS,
});

type HoldState = 'unheld' | 'held';

/**
 * The ticket kinds a forge offers a ticket in each status, held and unheld, while no job works on it: retaken from forge's
 * `BoardOffers.parity.spec.ts` (`ticketOffersOf` on its fixture board), in the order it lists them.
 */
const OFFERED_KINDS_OF_STATUS: Readonly<Record<HoldState, Readonly<Record<BoardTicketStatus, readonly BoardOfferedCommandKind[]>>>> = {
  unheld: {
    'draft':            ['ticket-ready', 'ticket-hold', 'ticket-park', 'ticket-network', 'ticket-priority'],
    'ready-for-review': ['ticket-ready', 'ticket-hold', 'ticket-park', 'ticket-network', 'ticket-priority'],
    'committed':        ['ticket-hold', 'ticket-park', 'ticket-network', 'ticket-priority', 'ticket-deliver-by-hand'],
    'in-progress':      ['ticket-hold', 'ticket-park', 'ticket-priority', 'ticket-deliver-by-hand'],
    'in-review':        ['ticket-hold', 'ticket-park', 'ticket-priority', 'ticket-deliver-by-hand'],
    'reviewed':         ['ticket-hold', 'ticket-park', 'ticket-priority', 'ticket-deliver-by-hand'],
    'delivered':        ['ticket-priority'],
    'abandoned':        ['ticket-priority', 'ticket-deliver-by-hand'],
  },
  held: {
    'draft':            ['ticket-ready', 'ticket-unhold', 'ticket-park', 'ticket-network', 'ticket-priority'],
    'ready-for-review': ['ticket-ready', 'ticket-unhold', 'ticket-park', 'ticket-network', 'ticket-priority'],
    'committed':        ['ticket-unhold', 'ticket-park', 'ticket-network', 'ticket-priority', 'ticket-deliver-by-hand'],
    'in-progress':      ['ticket-unhold', 'ticket-park', 'ticket-priority', 'ticket-deliver-by-hand'],
    'in-review':        ['ticket-unhold', 'ticket-park', 'ticket-priority', 'ticket-deliver-by-hand'],
    'reviewed':         ['ticket-unhold', 'ticket-park', 'ticket-priority', 'ticket-deliver-by-hand'],
    'delivered':        ['ticket-priority'],
    'abandoned':        ['ticket-priority', 'ticket-deliver-by-hand'],
  },
};

const STATUSES_NO_AGENT_HAS_PICKED_UP: readonly BoardTicketStatus[] = ['draft', 'ready-for-review', 'committed'];

const CLOSED_STATUSES: readonly BoardTicketStatus[] = ['delivered', 'abandoned'];

const PRIORITIES_HIGHEST_FIRST: readonly BoardTicketPriority[] = ['high', 'normal', 'low'];

/** As a forge serves them: every priority but the ticket's own, and never `low` once an agent has picked the ticket up. */
function priorityChoicesOf(status: BoardTicketStatus, resolvedPriority: BoardTicketPriority): BoardTicketPriority[] {
  return PRIORITIES_HIGHEST_FIRST.filter((priority) => priority !== resolvedPriority && (priority !== 'low' || STATUSES_NO_AGENT_HAS_PICKED_UP.includes(status)));
}

function offersOf(status: BoardTicketStatus, hold: string | null, resolvedPriority: BoardTicketPriority): BoardTicketOffersDocument {
  return { kinds: OFFERED_KINDS_OF_STATUS[hold === null ? 'unheld' : 'held'][status], priorityChoices: priorityChoicesOf(status, resolvedPriority) };
}

/** A stamp of the example day at a wall clock, `09:30`, in the story's zone. */
export function exampleStampAt(clock: string, day = EXAMPLE_TODAY): string {
  return `${day}T${clock}:00+02:00`;
}

/** A committed ticket filed at 09:00 with the facts and offers a forge serves for its status, hold and priority, unless the fields set them. */
export function exampleDetailTicket(id: string, fields: Partial<BoardTicketDocument> = {}): BoardTicketDocument {
  const status = fields.status ?? 'committed';
  const hold = fields.hold ?? null;
  const resolvedPriority = fields.priority ?? EXAMPLE_BOARD_LIMITS.defaultTicketPriority;
  return exampleTicket({
    id,
    title:    `Example ticket ${id}`,
    filed:    exampleStampAt('09:00'),
    updated:  exampleStampAt('09:00'),
    bodyHtml: `<p>Body of example ticket ${id}.</p>`,
    facts:    {
      resolvedPriority,
      settlesADependency:   status === 'delivered',
      isClosed:             CLOSED_STATUSES.includes(status),
      noAgentHasPickedItUp: STATUSES_NO_AGENT_HAS_PICKED_UP.includes(status),
      reviewRound:          null,
      isRepeatReview:       false,
    },
    offers: offersOf(status, hold, resolvedPriority),
    ...fields,
  });
}

export function exampleDetailRow(id: number, fields: Partial<BoardTaskDocument> = {}): BoardTaskDocument {
  return exampleTask({
    id, name: `Example row ${String(id)}`, status: 'committed', ...fields
  });
}

/** A running build job on the ticket, attempt 1, with no call made yet against a budget of 150, which takes a message and a fresh agent. */
export function exampleDetailJob(id: string, ticketId: string, fields: Partial<BoardJobDocument> = {}): BoardJobDocument {
  const job = exampleAgentJob({ id, ticketIds: [ticketId], launchedAt: null });
  return {
    ...job,
    live:      { ...job.live, calls: 0, lastToolCall: null },
    stopHolds: { stop: `stopped by User (${id})`, windDown: `wound down by User (${id})` },
    ...fields,
  };
}

/** An open incident on the ticket, waiting to take its default `gate-retry`. */
export function exampleDetailIncident(id: string, ticketId: string, fields: Partial<BoardIncidentDocument> = {}): BoardIncidentDocument {
  return {
    id,
    kind:            'sandbox-unavailable',
    ticketIds:       [ticketId],
    jobId:           null,
    facts:           {},
    defaultMove:     'gate-retry',
    deliveredInTurn: null,
    openedAt:        exampleStampAt('10:00'),
    ...fields,
  };
}

/** A committed ticket's forecast: a builder takes it, Customs and the gate, a review, then it lands on main; nothing waits on it. */
export function exampleTicketForecast(ticketId: string, fields: Partial<BoardTicketForecastDocument> = {}): BoardTicketForecastDocument {
  return {
    ticketId,
    steps: [
      { kind: 'build', attempt: 1, jobId: null },
      { kind: 'customs-and-gates', gateNames: ['tests'], jobId: null },
      { kind: 'review', round: 1, jobId: null },
      { kind: 'land', target: 'main' },
    ],
    currentStepIndex: null,
    dependents:       [],
    ...fields,
  };
}

/** A filing draft waiting on User with no question asked yet, unless the fields say otherwise. */
export function exampleFilingDraft(id: string, fields: Partial<BoardFilingDraftDocument> = {}): BoardFilingDraftDocument {
  return {
    id, title: `Example draft ${id}`, claimOwner: null, openedAt: exampleStampAt('09:00'), state: 'waiting', openQuestionCount: 0, questions: [], ...fields
  };
}

export type ExampleMergeTarget = Pick<BoardMergeTargetDocument, 'target' | 'waitingForMerge'>;

export interface ExampleDetailBoardFields {
  readonly tickets:          readonly BoardTicketDocument[];
  /** Every row, in board order; a ticket's own row is the one whose `ticket` names it, a review row the one whose `reviewOf` does. */
  readonly rows?:            readonly BoardTaskDocument[];
  /** The display state the forge serves for a ticket or a row (by its id), where it differs from the stored status. */
  readonly displayStates?:   Readonly<Record<string, BoardDisplayState>>;
  readonly reviewedFirst?:   readonly number[];
  readonly waitingOn?:       Readonly<Record<string, readonly string[]>>;
  readonly log?:             readonly BoardLogEntryDocument[];
  readonly drafts?:          readonly BoardFilingDraftDocument[];
  readonly draftRequests?:   readonly BoardDraftRequestDocument[];
  /** The tickets waiting for merge, each target with its prediction: a forge with merge approval on offers Accept on a clean one, and Update branch. */
  readonly mergeTargets?:    readonly ExampleMergeTarget[];
  /** The board's jobs; a ticket a job works on is not offered a delivery by hand. */
  readonly jobs?:            readonly BoardJobDocument[];
  readonly ticketForecasts?: readonly BoardTicketForecastDocument[];
  readonly incidents?:       readonly BoardIncidentDocument[];
  /** A board without epics, for a spec of the whole shell, whose other views read an epic's full roll-up. */
  readonly withoutEpics?:    boolean;
}

function exampleEpic(key: string, title: string, slot: number): BoardEpicDocument {
  return {
    key, title, slot, ticketIds: [], ticketCountByStatus: ticketCountByStatusOf({}), tokens: 0, span: null
  };
}

const EXAMPLE_EPICS: readonly BoardEpicDocument[] = [exampleEpic('billing', 'Example billing', 4), exampleEpic('checkout', 'Example checkout', 2)];

/** The merge kinds a forge adds for a ticket waiting for merge, and the delivery by hand it takes away while a job works on the ticket. */
function ticketWithBoardOffers(ticket: BoardTicketDocument, mergeTargets: readonly ExampleMergeTarget[], jobs: readonly BoardJobDocument[]): BoardTicketDocument {
  const waitingEntry = mergeTargets.flatMap((target) => target.waitingForMerge).find((entry) => entry.ticketId === ticket.id);
  const jobWorksOnIt = jobs.some((job) => job.ticketIds.includes(ticket.id));
  const mergeKinds: BoardOfferedCommandKind[] = waitingEntry === undefined ? [] : [
    ...(waitingEntry.againstTarget === 'clean' ? ['merge-accept' as const] : []),
    ...(jobWorksOnIt ? [] : ['merge-update' as const]),
  ];
  const kinds = [...ticket.offers.kinds.filter((kind) => !(jobWorksOnIt && kind === 'ticket-deliver-by-hand')), ...mergeKinds];
  return { ...ticket, offers: { ...ticket.offers, kinds } };
}

export function exampleDetailBoard(fields: ExampleDetailBoardFields): BoardDocument {
  const rows = fields.rows ?? [];
  const jobs = fields.jobs ?? [];
  const mergeTargets = fields.mergeTargets ?? [];
  const tickets = fields.tickets.map((ticket) => ticketWithBoardOffers(ticket, mergeTargets, jobs));
  const positionsOf = (matches: (row: BoardTaskDocument) => boolean): number[] => rows.flatMap((row, position) => (matches(row) ? [position] : []));
  const board = boardStateFixture();
  return boardStateFixture({
    page: {
      ...board.page,
      progress:      { ...board.page.progress, tasks: rows, log: fields.log ?? [] },
      draftRequests: fields.draftRequests ?? [],
      facts:         {
        rows: rows.map((row) => ({
          displayState:                   fields.displayStates?.[String(row.id)] ?? row.status,
          deliveredRowCountsAsReviewed:   (fields.reviewedFirst ?? []).includes(row.id),
          ownRowPositionOfReviewedTicket: null,
        })),
        tickets: tickets.map((ticket) => ({
          ticketId:           ticket.id,
          ownRowPosition:     positionsOf((row) => row.ticket === ticket.id)[0] ?? null,
          reviewBarPositions: positionsOf((row) => row.reviewOf === ticket.id),
          displayState:       fields.displayStates?.[ticket.id] ?? ticket.status,
          waitingOnTicketIds: fields.waitingOn?.[ticket.id] ?? [],
          entity:             null,
          stage:              null,
        })),
        epics:        fields.withoutEpics === true ? [] : EXAMPLE_EPICS,
        readyTickets: [],
        drafts:       fields.drafts ?? [],
      },
      tickets,
    },
    mergeQueue: {
      queuedTicketIds: [],
      targets:         mergeTargets.map((target) => ({
        ...target, holder: null, order: [], pairwiseConflicts: [], targetMovedDecisionIds: []
      })),
    },
    jobs,
    decisions:       [],
    openDecisionIds: [],
    ticketForecasts: fields.ticketForecasts ?? [],
    incidents:       fields.incidents ?? [],
  });
}
