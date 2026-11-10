/**
 * The ticket form a Kanban card or wave card opens, as a model: the head (id, title, the state pill, a Done card's reviewed mark, priority
 * and type), the section tabs with the Activity count, and every section whatever tab is shown: the Overview, the Timeline, the log lines
 * claimed for the ticket and its own row, and the body.
 */
import type { DisplayState }                                      from '../../../src/lib/tracker-model/@types/Task.ts';
import type { TicketPriority, TicketType }                        from '../../../src/lib/tracker-model/@types/Ticket.ts';
import { FIRST_REPEAT_REVIEW_ROUND }                              from '../../../src/lib/tracker-model/constants/ReviewRounds.ts';
import { TicketDefaultsUtil }                                     from '../../../src/lib/tracker-model/utils/TicketDefaultsUtil.ts';
import type { DetailBoardState }                                  from '../../@types/DetailBoardState.ts';
import { TICKET_SECTIONS, type TicketSection }                    from '../../shell/DetailRoute.ts';
import { DisplayStateWordingUtil }                                from '../../utils/DisplayStateWordingUtil.ts';
import { TimeUtil }                                               from '../../utils/TimeUtil.ts';
import { DetailControlsModelUtil }                                from './DetailControlsModel.ts';
import { DetailFactsModel, type DetailFormat, type LogLineModel } from './DetailFactsModel.ts';
import { TicketOverviewModelUtil, type TicketOverviewModel }      from './TicketOverviewModel.ts';
import { TicketTimelineModelUtil, type TicketTimelineModel }      from './TicketTimelineModel.ts';

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
  readonly stateToken:    DisplayState;
  readonly stateLabel:    string;
  /** A Done card reviewed first: the ✓ mark's title, `null` on every other ticket. */
  readonly reviewedTitle: string | null;
  readonly priority:      TicketPriority;
  readonly ticketType:    TicketType;
  /** The section shown, Overview when the route names none. */
  readonly section:       TicketSection;
  readonly tabs:          readonly TicketSectionTabModel[];
  readonly overview:      TicketOverviewModel;
  readonly timeline:      TicketTimelineModel;
  /** Newest first. */
  readonly activity:      readonly LogLineModel[];
  readonly bodyHtml:      string;
}

function reviewedTitleOf(reviewed: string | undefined, format: DetailFormat): string {
  return reviewed === undefined ? REVIEWED_WITHOUT_STAMP_TITLE : `Reviewed ${TimeUtil.fullStampText(reviewed, format.limits)} before it was done`;
}

function tabsOf(activityCount: number): TicketSectionTabModel[] {
  return TICKET_SECTIONS.map((section) => ({ section, label: SECTION_LABEL[section], count: section === 'activity' && activityCount > 0 ? activityCount : null }));
}

/** `null` when the board holds no ticket of that id. */
function ticketDetailModelOf(state: DetailBoardState, ticketId: string, section: TicketSection, format: DetailFormat): TicketDetailModel | null {
  const { tickets, payload } = state.page;
  const ticket = tickets.find((candidate) => candidate.id === ticketId);
  if (ticket === undefined) return null;
  const facts = payload.boardFacts.tickets.find((candidate) => candidate.ticketId === ticketId);
  const { ownRow, reviewRows } = DetailFactsModel.ticketRowsOf(state, ticketId);
  const ownRowFacts = facts?.ownRowPosition === null || facts?.ownRowPosition === undefined ? undefined : payload.boardFacts.rows[facts.ownRowPosition];
  const displayState = facts?.displayState ?? ticket.status;
  const waitingOn = facts?.waitingOnTicketIds ?? [];
  const activity = DetailFactsModel.logLinesOf(payload.progress.log, ownRow?.id ?? null, ticket.id, format);
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
    section,
    tabs:          tabsOf(activity.length),
    overview:      TicketOverviewModelUtil.overviewOf({
      state,
      ticket,
      displayState,
      waitingOn,
      ownRow,
      reviewRows,
      controls: DetailControlsModelUtil.controlsOf(ticket, state.mergeQueue),
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
