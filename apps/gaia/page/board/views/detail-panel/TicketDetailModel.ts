/**
 * The ticket form a Kanban card or wave card opens, as a model: the head (id, title, the state pill, a Done card's reviewed mark, priority
 * and type), the section tabs with the Activity count, and every section whatever tab is shown: the Overview, the Timeline, the log lines
 * claimed for the ticket and its own row, and the body.
 */
import type { BoardDocument }                                           from '../../../@types/board/BoardDocument.ts';
import type { BoardDisplayState, BoardTicketPriority, BoardTicketType } from '../../../@types/board/BoardVocabulary.ts';
import { TICKET_SECTIONS, type TicketSection }                          from '../../shell/DetailRoute.ts';
import { DisplayStateWordingUtil }                                      from '../../utils/DisplayStateWordingUtil.ts';
import { TimeUtil }                                                     from '../../utils/TimeUtil.ts';
import { DetailControlsModelUtil }                                      from './DetailControlsModel.ts';
import { DetailFactsModel, type DetailFormat, type LogLineModel }       from './DetailFactsModel.ts';
import { TicketOverviewModelUtil, type TicketOverviewModel }            from './TicketOverviewModel.ts';
import { TicketTimelineModelUtil, type TicketTimelineModel }            from './TicketTimelineModel.ts';

const REVIEWED_WITHOUT_STAMP_TITLE = 'Reviewed before it was done';

const SECTION_LABEL: Readonly<Record<TicketSection, string>> = {
  overview:    'Overview',
  timeline:    'Timeline',
  activity:    'Activity',
  description: 'Description',
};

/** A section tab; `count` only on Activity, and only while a log line names the ticket or its row. */
export interface TicketSectionTabModel {
  readonly section: TicketSection;
  readonly label:   string;
  readonly count:   number | null;
}

export interface TicketDetailModel {
  readonly form:          'ticket';
  readonly ticketId:      string;
  readonly idText:        string;
  readonly title:         string;
  readonly stateToken:    BoardDisplayState;
  readonly stateLabel:    string;
  /** A Done card reviewed first: the ✓ mark's title, `null` on every other ticket. */
  readonly reviewedTitle: string | null;
  readonly priority:      BoardTicketPriority;
  readonly ticketType:    BoardTicketType;
  /** The section shown, Overview when the route names none. */
  readonly section:       TicketSection;
  readonly tabs:          readonly TicketSectionTabModel[];
  readonly overview:      TicketOverviewModel;
  readonly timeline:      TicketTimelineModel;
  /** Newest first. */
  readonly activity:      readonly LogLineModel[];
  readonly bodyHtml:      string;
}

function reviewedTitleOf(reviewed: string | null, format: DetailFormat): string {
  return reviewed === null ? REVIEWED_WITHOUT_STAMP_TITLE : `Reviewed ${TimeUtil.fullStampText(reviewed, format.limits)} before it was done`;
}

function tabsOf(activityCount: number): TicketSectionTabModel[] {
  return TICKET_SECTIONS.map((section) => ({ section, label: SECTION_LABEL[section], count: section === 'activity' && activityCount > 0 ? activityCount : null }));
}

/** `null` when the board holds no ticket of that id. */
function ticketDetailModelOf(board: BoardDocument, ticketId: string, section: TicketSection, format: DetailFormat): TicketDetailModel | null {
  const { tickets, facts: pageFacts, progress } = board.page;
  const ticket = tickets.find((candidate) => candidate.id === ticketId);
  if (ticket === undefined) return null;
  const facts = pageFacts.tickets.find((candidate) => candidate.ticketId === ticketId);
  const { ownRow, reviewRows } = DetailFactsModel.ticketRowsOf(board, ticketId);
  const ownRowFacts = facts?.ownRowPosition === null || facts?.ownRowPosition === undefined ? undefined : pageFacts.rows[facts.ownRowPosition];
  const displayState = facts?.displayState ?? ticket.status;
  const waitingOn = facts?.waitingOnTicketIds ?? [];
  const activity = DetailFactsModel.logLinesOf(progress.log, ownRow?.id ?? null, ticket.id, format);
  return {
    form:          'ticket',
    ticketId:      ticket.id,
    idText:        `#${ticket.id}`,
    title:         ticket.title,
    stateToken:    displayState,
    stateLabel:    DisplayStateWordingUtil.stateLabelOf(displayState, ticket.facts.reviewRound ?? format.limits.firstRepeatReviewRound),
    reviewedTitle: ownRow !== null && ownRowFacts?.deliveredRowCountsAsReviewed === true ? reviewedTitleOf(ownRow.reviewed, format) : null,
    priority:      ticket.facts.resolvedPriority,
    ticketType:    ticket.type,
    section,
    tabs:          tabsOf(activity.length),
    overview:      TicketOverviewModelUtil.overviewOf({
      board,
      ticket,
      displayState,
      waitingOn,
      ownRow,
      reviewRows,
      controls: DetailControlsModelUtil.controlsOf(ticket, board.mergeQueue),
      format,
    }),
    timeline: TicketTimelineModelUtil.ticketTimelineModelOf({
      ticket,
      ownRow,
      reviewRows,
      waitingOn,
      nowEpochMilliseconds: format.nowEpochMilliseconds,
      todayCalendarDate:    format.todayCalendarDate,
      limits:               format.limits,
    }),
    activity,
    bodyHtml: ticket.bodyHtml,
  };
}

export const TicketDetailModelUtil = Object.freeze({ ticketDetailModelOf, reviewedTitleOf });
