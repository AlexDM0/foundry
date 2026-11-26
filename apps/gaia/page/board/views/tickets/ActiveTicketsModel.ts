/**
 * The Active segment as data: a stage table of the committed tickets up to the merged ones, each with its stage, its agent at work and how
 * long that has lasted. An open question of the ticket's agent and a ticket it waits on are the stage, as they are what holds it; else
 * the forge's display state is. Tickets with an agent come first, each part by id.
 */
import type { BoardDecisionDocument }                       from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                               from '../../../@types/board/BoardDocument.ts';
import type { BoardTicketDocument }                         from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState }                           from '../../../@types/board/BoardVocabulary.ts';
import { TicketRowFactsUtil, type RowEpic, type RowMoment } from '../../shared/tickets/TicketRowFactsUtil.ts';
import { TicketSegmentUtil }                                from '../../shared/tickets/TicketSegmentUtil.ts';
import { DisplayStateWordingUtil }                          from '../../utils/DisplayStateWordingUtil.ts';
import { TicketsModel }                                     from './TicketsModel.ts';

export interface ActiveStageModel {
  readonly label: string;
  /** The state the stage's badge looks as. */
  readonly state: BoardDisplayState;
}

export interface ActiveAgentModel {
  readonly text:     string;
  /** The state the agent's dot looks as. */
  readonly dotState: BoardDisplayState;
  readonly pulsing:  boolean;
}

export interface ActiveTicketRowModel {
  readonly ticketId:  string;
  readonly idText:    string;
  readonly title:     string;
  readonly stage:     ActiveStageModel;
  readonly agent:     ActiveAgentModel;
  readonly epic:      RowEpic | null;
  readonly sinceText: string | null;
}

export interface ActiveTicketsModel {
  readonly rows:  readonly ActiveTicketRowModel[];
  /** Every active ticket, the search aside: the segment's count. */
  readonly count: number;
}

/** What an asking agent and a ticket with no agent look as: dashed, as everything that waits. */
const ASKING_STATE: BoardDisplayState = 'ready-for-review';
const IDLE_STATE: BoardDisplayState = 'committed';

function openQuestionOf(board: Pick<BoardDocument, 'decisions'>, ticketId: string): BoardDecisionDocument | null {
  return board.decisions.find((decision) => decision.document === null && decision.ticketIds.includes(ticketId)) ?? null;
}

function rowOf(ticket: BoardTicketDocument, board: BoardDocument, moment: RowMoment): ActiveTicketRowModel {
  const pageFacts = board.page.facts.tickets.find((facts) => facts.ticketId === ticket.id);
  const displayState = pageFacts?.displayState ?? ticket.status;
  const waitingOn = pageFacts?.waitingOnTicketIds ?? [];
  const question = openQuestionOf(board, ticket.id);
  const job = TicketRowFactsUtil.liveJobOf(board, ticket.id);
  const reviewRound = ticket.facts.reviewRound ?? board.limits.firstRepeatReviewRound;
  const stage: ActiveStageModel = (() => {
    if (question !== null) return { label: `Asks ${question.id}`, state: ASKING_STATE };
    if (displayState === 'committed' && waitingOn.length > 0) return { label: `Waits on ${waitingOn.map((ticketId) => `#${ticketId}`).join(', ')}`, state: displayState };
    return { label: DisplayStateWordingUtil.stateLabelOf(displayState, reviewRound), state: displayState };
  })();
  const agent: ActiveAgentModel = (() => {
    if (job === null) return { text: 'no agent yet', dotState: IDLE_STATE, pulsing: false };
    const named = `${job.id} ${TicketRowFactsUtil.roleWordOf(job.role, job.kind)}`;
    if (question !== null && question.jobId === job.id) return { text: `${named} asks you`, dotState: ASKING_STATE, pulsing: false };
    return { text: `${named} · ${TicketRowFactsUtil.tokensTextOf(job.live.tokens)}`, dotState: TicketRowFactsUtil.workingDotStateOf(job.role), pulsing: true };
  })();
  const sinceText = ((): string | null => {
    if (question !== null) {
      const asked = TicketRowFactsUtil.ageTextOf(question.openedAt, moment);
      return asked === null ? null : `asked ${asked}`;
    }
    if (job !== null) return TicketRowFactsUtil.runningTextOf(job.launchedAt, moment);
    const stamp = TicketRowFactsUtil.stampTextOf(ticket.updated, moment);
    return displayState === 'committed' ? `ready ${stamp}` : `since ${stamp}`;
  })();
  return {
    ticketId: ticket.id,
    idText:   `#${ticket.id}`,
    title:    ticket.title,
    stage,
    agent,
    epic:     TicketRowFactsUtil.primaryEpicOf(ticket, board.page.facts.epics),
    sinceText,
  };
}

/** Work under way first, then the rest, each by id. */
function underWayFirst(a: ActiveTicketRowModel, b: ActiveTicketRowModel): number {
  const firstIsIdle = a.agent.dotState === IDLE_STATE ? 1 : 0;
  const secondIsIdle = b.agent.dotState === IDLE_STATE ? 1 : 0;
  return firstIsIdle === secondIsIdle ? Number(a.ticketId) - Number(b.ticketId) : firstIsIdle - secondIsIdle;
}

function activeTicketsModelOf(board: BoardDocument, moment: RowMoment, searchText: string): ActiveTicketsModel {
  const tickets = TicketSegmentUtil.ticketsInSegment(board, 'active');
  const rows = tickets.map((ticket) => rowOf(ticket, board, moment)).toSorted(underWayFirst);
  return {
    rows:  rows.filter((row) => TicketsModel.rowMatches({ idText: row.idText, words: [row.title, row.epic?.title ?? '', row.stage.label, row.agent.text] }, searchText)),
    count: tickets.length,
  };
}

export const ActiveTicketsModelUtil = Object.freeze({ activeTicketsModelOf });
