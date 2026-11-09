/**
 * The ticket form a Kanban card or wave card opens, as a model: the head (id, title, the state pill, a Done card's reviewed mark, priority
 * and type), the facts led by the ticket's epics and its group's integration, the Bridge's controls, the Timeline and the body.
 */
import type { DisplayState }                                 from '../../../src/lib/tracker-model/@types/Task.ts';
import type { TicketPriority, TicketType }                   from '../../../src/lib/tracker-model/@types/Ticket.ts';
import { FIRST_REPEAT_REVIEW_ROUND }                         from '../../../src/lib/tracker-model/constants/ReviewRounds.ts';
import { TicketDefaultsUtil }                                from '../../../src/lib/tracker-model/utils/TicketDefaultsUtil.ts';
import type { DetailBoardState }                             from '../../@types/DetailBoardState.ts';
import { DisplayStateWordingUtil }                           from '../../utils/DisplayStateWordingUtil.ts';
import { TimeUtil }                                          from '../../utils/TimeUtil.ts';
import { DetailControlsModelUtil, type DetailControlsModel } from './DetailControlsModel.ts';
import {
  CLOSING_EVENT_WORD,
  DetailFactsModel,
  type DetailFactModel,
  type DetailFormat
} from './DetailFactsModel.ts';
import { TicketTimelineModelUtil, type TicketTimelineModel } from './TicketTimelineModel.ts';

const REVIEWED_WITHOUT_STAMP_TITLE = 'Reviewed before it was done';

export interface TicketDetailModel {
  readonly form:          'ticket';
  readonly ticketId:      string;
  readonly idText:        string;
  readonly title:         string;
  readonly stateToken:    DisplayState;
  readonly stateLabel:    string;
  /** A Done card reviewed first: the ✓ mark's title, `null` on every other ticket. */
  readonly reviewedTitle: string | null;
  readonly priority:      TicketPriority;
  readonly ticketType:    TicketType;
  readonly facts:         readonly DetailFactModel[];
  readonly controls:      DetailControlsModel;
  readonly timeline:      TicketTimelineModel;
  readonly bodyHtml:      string;
}

function reviewedTitleOf(reviewed: string | undefined, format: DetailFormat): string {
  return reviewed === undefined ? REVIEWED_WITHOUT_STAMP_TITLE : `Reviewed ${TimeUtil.fullStampText(reviewed, format.limits)} before it was done`;
}

/** `null` when the board holds no ticket of that id. */
function ticketDetailModelOf(state: DetailBoardState, ticketId: string, format: DetailFormat): TicketDetailModel | null {
  const { tickets, payload } = state.page;
  const ticket = tickets.find((candidate) => candidate.id === ticketId);
  if (ticket === undefined) return null;
  const facts = payload.boardFacts.tickets.find((candidate) => candidate.ticketId === ticketId);
  const { ownRow, reviewRows } = DetailFactsModel.ticketRowsOf(state, ticketId);
  const ownRowFacts = facts?.ownRowPosition === null || facts?.ownRowPosition === undefined ? undefined : payload.boardFacts.rows[facts.ownRowPosition];
  const displayState = facts?.displayState ?? ticket.status;
  const waitingOn = facts?.waitingOnTicketIds ?? [];
  return {
    form:          'ticket',
    ticketId:      ticket.id,
    idText:        `#${ticket.id}`,
    title:         ticket.title,
    stateToken:    displayState,
    stateLabel:    DisplayStateWordingUtil.stateLabelOf(displayState, ownRow?.reviewRound ?? FIRST_REPEAT_REVIEW_ROUND),
    reviewedTitle: ownRow !== null && ownRowFacts?.deliveredRowCountsAsReviewed === true ? reviewedTitleOf(ownRow.reviewed, format) : null,
    priority:      TicketDefaultsUtil.ticketPriorityOf(ticket),
    ticketType:    ticket.type,
    facts:         [
      ...DetailFactsModel.epicFactsOf(ticket, payload.boardFacts.epics),
      ...DetailFactsModel.integrationFactsOf(ticket, tickets, 'ticket'),
      ...DetailFactsModel.stampFactsOf([['filed', ticket.filed], ['started', ticket.started]], format),
      ...DetailFactsModel.pauseFactsOf(displayState, ownRow, format),
      ...DetailFactsModel.stampFactsOf([
        ['finished', ticket.finished],
        ['reviewed', ownRow?.reviewed],
        [CLOSING_EVENT_WORD.delivered, ticket.delivered],
        [CLOSING_EVENT_WORD.abandoned, ticket.abandonedAt],
      ], format),
      ...DetailFactsModel.textFactsOf([['reason', ticket.reason]]),
      ...DetailFactsModel.heldFactsOf(ticket),
      ...DetailFactsModel.ticketLinksFactsOf('waiting on', waitingOn, 'ticket'),
      ...DetailFactsModel.textFactsOf([['branch', ticket.branch]]),
      ...DetailFactsModel.taskFactsOf(ticket),
      ...DetailFactsModel.networkFactsOf(ticket),
    ],
    controls: DetailControlsModelUtil.controlsOf(ticket, state.mergeQueue),
    timeline: TicketTimelineModelUtil.ticketTimelineModelOf({
      ticket,
      ownRow,
      reviewRows,
      waitingOn,
      nowEpochMilliseconds: format.nowEpochMilliseconds,
      todayCalendarDate:    format.todayCalendarDate,
      limits:               format.limits,
    }),
    bodyHtml: ticket.bodyHtml,
  };
}

export const TicketDetailModelUtil = Object.freeze({ ticketDetailModelOf, reviewedTitleOf });
