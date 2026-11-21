/**
 * The row form a Gantt row or ticket-table line opens, as a model: the row's head, its Task facts, its Phases (recorded, or derived from
 * the stamps when none were), its ticket nested under Ticket, the controls the forge offers on that ticket, and the Log lines about either.
 */
import type { BoardDocument }                                                  from '../../../@types/board/BoardDocument.ts';
import type { BoardTaskDocument, BoardTaskPhaseDocument, BoardTicketDocument } from '../../../@types/board/BoardTicketDocuments.ts';
import type {
  BoardDisplayState,
  BoardTaskStatus,
  BoardTicketStatus,
  BoardTicketType
} from '../../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }                                     from '../../../shared/utils/CountTextUtil.ts';
import { DisplayStateWordingUtil }                           from '../../utils/DisplayStateWordingUtil.ts';
import { RowLabelUtil }                                      from '../../utils/RowLabelUtil.ts';
import { TimeUtil }                                          from '../../utils/TimeUtil.ts';
import { DetailControlsModelUtil, type DetailControlsModel } from './DetailControlsModel.ts';
import {
  CLOSING_EVENT_WORD,
  DetailFactsModel,
  type DetailFactModel,
  type DetailFormat,
  type LogLineModel,
  type StampModel
} from './DetailFactsModel.ts';

export const PHASES_WERE_NOT_RECORDED_NOTE = 'The phases of this row were not recorded, so what follows is derived from its own stamps and its ticket’s.';

export const NO_PHASES_TO_SHOW_NOTE = 'The phases of this row were not recorded, and its stamps carry nothing to derive them from.';

export const NO_LOG_LINES_NOTE = 'No log line names this row or its ticket.';

/** How far up the ladder a status is, so a derived phase a row never reached is left out; `abandoned` sits above everything it could follow. */
const LADDER_RANK_FOR_TASK_STATUS: Readonly<Record<BoardTaskStatus, number>> = {
  'committed':   0,
  'in-progress': 1,
  'paused':      1,
  'in-review':   2,
  're-review':   2,
  'reviewed':    3,
  'delivered':   4,
  'abandoned':   5,
};

export interface PhaseLineModel {
  readonly stateToken: BoardDisplayState;
  readonly label:      string;
  readonly stamp:      StampModel;
  /** `after 41m`, the time since the phase before; `null` on the first or where the stamps run backwards. */
  readonly gapText:    string | null;
}

/** The phases section: a note when they were derived or are missing, then the lines. */
export interface PhasesModel {
  readonly note:  string | null;
  readonly lines: readonly PhaseLineModel[];
}

/** The head: the row's label, its displayed name and its display state's pill; with no row, the ticket's id, title and status badge. */
export interface RowDetailHeadModel {
  readonly idText:     string;
  readonly title:      string;
  /** The row's full name on hover where the displayed one dropped its `#NNN`. */
  readonly titleTitle: string | null;
  readonly state:
    | { readonly kind: 'row'; readonly token: BoardDisplayState; readonly label: string }
    | { readonly kind: 'ticket-status'; readonly status: BoardTicketStatus; readonly label: string };
}

export interface RowTicketModel {
  readonly ticketId:    string;
  readonly idText:      string;
  readonly title:       string;
  readonly ticketType:  BoardTicketType;
  readonly status:      BoardTicketStatus;
  readonly statusLabel: string;
  readonly facts:       readonly DetailFactModel[];
  readonly bodyHtml:    string;
  readonly controls:    DetailControlsModel;
}

export interface RowDetailModel {
  readonly form:      'row';
  readonly head:      RowDetailHeadModel;
  /** `null` for a ticket without a row: the Task and Phases sections are left out. */
  readonly taskFacts: readonly DetailFactModel[] | null;
  readonly phases:    PhasesModel | null;
  readonly ticket:    RowTicketModel | null;
  readonly logLines:  readonly LogLineModel[];
}

interface PhaseLine {
  readonly state:       BoardDisplayState;
  readonly reviewRound: number;
  readonly at:          string;
}

function durationBetween(fromStamp: string | null | undefined, toStamp: string | null | undefined, format: DetailFormat): string | null {
  const fromEpochMilliseconds = TimeUtil.epochMillisecondsOf(fromStamp);
  const toEpochMilliseconds = TimeUtil.epochMillisecondsOf(toStamp);
  return fromEpochMilliseconds === null || toEpochMilliseconds === null ? null : TimeUtil.formatDuration(toEpochMilliseconds - fromEpochMilliseconds, format.limits);
}

function taskFactsOf(task: BoardTaskDocument, format: DetailFormat): DetailFactModel[] {
  return [
    ...DetailFactsModel.textFactsOf([['owner', task.owner], ['note', task.note]]),
    ...DetailFactsModel.stampFactsOf([['start', task.start], ['end', task.end]], format),
    ...DetailFactsModel.textFactsOf([
      ['elapsed', durationBetween(task.start, task.end, format) ?? undefined],
      ['tokens', task.tokens === null ? undefined : CountTextUtil.shortCountTextOf(task.tokens)],
      ['review round', task.reviewRound === null ? undefined : String(task.reviewRound)],
    ]),
    ...DetailFactsModel.ticketLinksFactsOf('ticket', task.ticket === null ? [] : [task.ticket], 'ticket-row'),
  ];
}

/**
 * A round is counted off the list rather than read from the row, because a row stays in `re-review` between rounds and carries only the
 * last; the count restarts at a `committed` phase, as a row sent back restarts its rounds.
 */
function recordedPhaseLines(history: readonly BoardTaskPhaseDocument[], firstRepeatReviewRound: number): PhaseLine[] {
  let repeatReviews = 0;
  return history.map((phase) => {
    if (phase.status === 'committed') repeatReviews = 0;
    if (phase.status === 're-review') repeatReviews += 1;
    return { state: phase.status, reviewRound: firstRepeatReviewRound + Math.max(0, repeatReviews - 1), at: phase.at };
  });
}

/**
 * Ladder order rather than stamp order: the ladder is the sequence, and nothing here compares two clocks to decide anything. An abandoned
 * row's `end` stands in for the abandonment and never for a finish; only the ticket's `finished` says a row abandoned out of review was handed in.
 */
function derivedPhaseLines(task: BoardTaskDocument, ticket: BoardTicketDocument | null, firstRepeatReviewRound: number): PhaseLine[] {
  const reachedRank = LADDER_RANK_FOR_TASK_STATUS[task.status];
  const rowWasAbandoned = task.status === 'abandoned';
  const candidates: (readonly [BoardTaskStatus, string | null | undefined])[] = [
    ['committed', ticket?.filed],
    ['in-progress', task.start ?? ticket?.started],
    ['in-review', rowWasAbandoned ? ticket?.finished : task.end ?? ticket?.finished],
    ['reviewed', task.reviewed],
    ['delivered', ticket?.delivered],
    ['abandoned', rowWasAbandoned ? ticket?.abandonedAt ?? task.end : null],
  ];
  return candidates.flatMap(([status, at]) => (typeof at === 'string' && at !== '' && LADDER_RANK_FOR_TASK_STATUS[status] <= reachedRank
    ? [{ state: status, reviewRound: task.reviewRound ?? firstRepeatReviewRound, at }]
    : []));
}

/** The newest phase is the row as it stands, so it takes the row's display state, as the chart does; an older phase keeps its own. */
function withNewestAsTheChartShows(lines: readonly PhaseLine[], task: BoardTaskDocument, displayState: BoardDisplayState): PhaseLine[] {
  const newest = lines.at(-1);
  if (newest === undefined || newest.state !== task.status) return [...lines];
  return [...lines.slice(0, -1), { ...newest, state: displayState }];
}

function phasesOf(task: BoardTaskDocument, ticket: BoardTicketDocument | null, displayState: BoardDisplayState, format: DetailFormat): PhasesModel {
  const history = task.history ?? [];
  const phasesWereRecorded = history.length > 0;
  const { firstRepeatReviewRound } = format.limits;
  const lines = withNewestAsTheChartShows(
    phasesWereRecorded ? recordedPhaseLines(history, firstRepeatReviewRound) : derivedPhaseLines(task, ticket, firstRepeatReviewRound),
    task,
    displayState,
  );
  if (lines.length === 0) return { note: NO_PHASES_TO_SHOW_NOTE, lines: [] };
  return {
    note:  phasesWereRecorded ? null : PHASES_WERE_NOT_RECORDED_NOTE,
    lines: lines.map((line, index) => {
      const gap = durationBetween(lines[index - 1]?.at, line.at, format);
      return {
        stateToken: line.state,
        label:      DisplayStateWordingUtil.stateLabelOf(line.state, line.reviewRound),
        stamp:      DetailFactsModel.stampOf(line.at, format),
        gapText:    gap === null ? null : `after ${gap}`,
      };
    }),
  };
}

function rowTicketOf(board: BoardDocument, ticket: BoardTicketDocument, format: DetailFormat): RowTicketModel {
  const { tickets, facts } = board.page;
  return {
    ticketId:    ticket.id,
    idText:      `#${ticket.id}`,
    title:       ticket.title,
    ticketType:  ticket.type,
    status:      ticket.status,
    statusLabel: DisplayStateWordingUtil.labelOf(ticket.status),
    facts:       [
      ...DetailFactsModel.epicFactsOf(ticket, facts.epics),
      ...DetailFactsModel.integrationFactsOf(ticket, tickets, 'ticket-row'),
      ...DetailFactsModel.stampFactsOf([
        ['filed', ticket.filed],
        ['started', ticket.started],
        ['finished', ticket.finished],
        [CLOSING_EVENT_WORD.delivered, ticket.delivered],
        [CLOSING_EVENT_WORD.abandoned, ticket.abandonedAt],
      ], format),
      ...DetailFactsModel.textFactsOf([['branch', ticket.branch], ['commit', ticket.commit], ['reason', ticket.reason]]),
      ...DetailFactsModel.taskFactsOf(ticket),
      ...DetailFactsModel.ticketLinksFactsOf('waits on', ticket.dependsOn, 'ticket-row'),
      ...DetailFactsModel.networkFactsOf(ticket),
    ],
    bodyHtml: ticket.bodyHtml,
    controls: DetailControlsModelUtil.controlsOf(ticket, board.mergeQueue),
  };
}

function ticketHeadOf(ticket: BoardTicketDocument): RowDetailHeadModel {
  return {
    idText: `#${ticket.id}`, title: ticket.title, titleTitle: null, state: { kind: 'ticket-status', status: ticket.status, label: DisplayStateWordingUtil.labelOf(ticket.status) }
  };
}

function rowHeadOf(task: BoardTaskDocument, displayState: BoardDisplayState, firstRepeatReviewRound: number): RowDetailHeadModel {
  const displayedName = RowLabelUtil.displayedRowNameOf(task);
  return {
    idText:     RowLabelUtil.rowLabelOf(task),
    title:      displayedName,
    titleTitle: displayedName === task.name ? null : task.name,
    state:      { kind: 'row', token: displayState, label: DisplayStateWordingUtil.stateLabelOf(displayState, task.reviewRound ?? firstRepeatReviewRound) },
  };
}

interface RowAndTicket {
  readonly task:   BoardTaskDocument | null;
  readonly ticket: BoardTicketDocument | null;
}

function rowDetailModelFor(board: BoardDocument, { task, ticket }: RowAndTicket, format: DetailFormat): RowDetailModel | null {
  const { page } = board;
  const logLines = DetailFactsModel.logLinesOf(page.progress.log, task?.id ?? null, ticket?.id ?? null, format);
  const ticketModel = ticket === null ? null : rowTicketOf(board, ticket, format);
  if (task === null) {
    return ticket === null ? null : {
      form: 'row', head: ticketHeadOf(ticket), taskFacts: null, phases: null, ticket: ticketModel, logLines
    };
  }
  const displayState = page.facts.rows[page.progress.tasks.indexOf(task)]?.displayState ?? task.status;
  return {
    form:      'row',
    head:      rowHeadOf(task, displayState, format.limits.firstRepeatReviewRound),
    taskFacts: taskFactsOf(task, format),
    phases:    phasesOf(task, ticket, displayState, format),
    ticket:    ticketModel,
    logLines,
  };
}

/** A Gantt row: the row and its own ticket; `null` when the board holds no row of that id. */
function taskRowDetailModelOf(board: BoardDocument, taskId: number, format: DetailFormat): RowDetailModel | null {
  const task = board.page.progress.tasks.find((candidate) => candidate.id === taskId) ?? null;
  if (task === null) return null;
  const ticket = task.ticket === null ? null : board.page.tickets.find((candidate) => candidate.id === task.ticket) ?? null;
  return rowDetailModelFor(board, { task, ticket }, format);
}

/** A ticket-table line: the ticket and its own row, if it has one; `null` when the board holds no ticket of that id. */
function ticketRowDetailModelOf(board: BoardDocument, ticketId: string, format: DetailFormat): RowDetailModel | null {
  const ticket = board.page.tickets.find((candidate) => candidate.id === ticketId) ?? null;
  if (ticket === null) return null;
  return rowDetailModelFor(board, { task: DetailFactsModel.ticketRowsOf(board, ticketId).ownRow, ticket }, format);
}

export const RowDetailModelUtil = Object.freeze({ taskRowDetailModelOf, ticketRowDetailModelOf });
