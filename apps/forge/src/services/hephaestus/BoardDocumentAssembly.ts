/**
 * The contract's board document of `GET /api/v4/board`, built from the same reading as `GET /api/state` and the monitor, part
 * by part through the board document's mappers, with the Board's offers and the readings a view would otherwise recompute. Its return
 * type is the proof that the served document is the contract's.
 */
import type { ForgeBoardDocument } from 'forge-contracts/ForgeBoardDocument';

import type { MergeQueueFacts }                      from '../../adapters/@types/BoardStateParts.ts';
import { BoardConversationMappingUtil }              from '../../adapters/board-document/utils/BoardConversationMappingUtil.ts';
import { BoardJobMappingUtil }                       from '../../adapters/board-document/utils/BoardJobMappingUtil.ts';
import { BoardMergeQueueMappingUtil }                from '../../adapters/board-document/utils/BoardMergeQueueMappingUtil.ts';
import { BoardPageMappingUtil, type TicketReadings } from '../../adapters/board-document/utils/BoardPageMappingUtil.ts';
import { BoardPipelineMappingUtil }                  from '../../adapters/board-document/utils/BoardPipelineMappingUtil.ts';
import { BoardReadingMappingUtil }                   from '../../adapters/board-document/utils/BoardReadingMappingUtil.ts';
import type { LogRecord }                            from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Board }                                from '../../lib/tracker-model/Board.ts';
import type { MergeForecast }                        from '../../lib/tracker-model/utils/MergeQueueUtil.ts';
import type { PageTicket }                           from '../../shared/@types/PagePayload.ts';
import { attentionEntriesOf }                        from '../../shared/monitor/AttentionEntries.ts';
import { todayCalendarDateOf, todayFiguresOf }       from '../../shared/monitor/TodayFigures.ts';
import { NoticeWordingUtil }                         from '../../shared/monitor/utils/NoticeWordingUtil.ts';
import { OpenDecisionsUtil }                         from '../../shared/monitor/utils/OpenDecisionsUtil.ts';
import type { BoardState }                           from './BoardState.ts';

/** One reading of the board: the state the monitor reads, the Board it was read from for the offers, and the clock's moment. */
export interface BoardDocumentSource {
  state:      BoardState;
  board:      Pick<Board, 'ticketOffersOf' | 'jobOffersOf'>;
  logRecords: readonly LogRecord[];
  /** Today is this moment's local calendar date; the moment is only shown, never compared. */
  now:        Date;
}

/** git's prediction for the ticket while it waits for merge, as the merge queue read it; `null` while it does not wait. */
function mergeWaitOf(mergeQueue: MergeQueueFacts, ticketId: string): MergeForecast | null {
  for (const target of mergeQueue.targets) {
    const waiting = target.waitingForMerge.find((entry) => entry.ticketId === ticketId);
    if (waiting !== undefined) return waiting.againstTarget;
  }
  return null;
}

function ticketReadingsOf(source: BoardDocumentSource): (ticket: PageTicket) => TicketReadings {
  const { state, board } = source;
  const { boardFacts, progress } = state.page.payload;
  const boardFactsById = new Map(boardFacts.tickets.map((facts) => [facts.ticketId, facts]));
  return (ticket) => {
    const facts = boardFactsById.get(ticket.id);
    const ownRow = facts?.ownRowPosition === null || facts === undefined ? undefined : progress.tasks[facts.ownRowPosition];
    return {
      facts:  BoardReadingMappingUtil.ticketFactsOf(ticket, facts, ownRow),
      offers: BoardReadingMappingUtil.ticketOffersOf(board.ticketOffersOf(ticket.id, mergeWaitOf(state.mergeQueue, ticket.id))),
    };
  };
}

function boardDocumentOf(source: BoardDocumentSource): ForgeBoardDocument {
  const { state, board } = source;
  const openDecisions = OpenDecisionsUtil.openDecisionsOf(state);
  const todayCalendarDate = todayCalendarDateOf(source.now);
  return {
    project:               state.project,
    hephaestus:            BoardPageMappingUtil.hephaestusOf(state.hephaestus),
    concurrency:           BoardPageMappingUtil.concurrencyOf(state.page.payload.concurrency),
    launchSlots:           BoardJobMappingUtil.launchSlotsOf(state.launchSlots),
    confinement:           state.confinement,
    usage:                 BoardPageMappingUtil.usageOf(state.usage),
    page:                  BoardPageMappingUtil.pageOf(state.page, ticketReadingsOf(source)),
    mergeQueue:            BoardMergeQueueMappingUtil.mergeQueueOf(state.mergeQueue),
    jobs:                  state.jobs.map((job) => BoardJobMappingUtil.jobOf(job, BoardReadingMappingUtil.jobOffersOf(board.jobOffersOf(job.id)))),
    endedJobs:             state.endedJobs.map(BoardJobMappingUtil.endedJobOf),
    decisions:             state.decisions.map(BoardConversationMappingUtil.decisionOf),
    incidents:             state.incidents.map(BoardConversationMappingUtil.incidentOf),
    questionHistory:       state.questionHistory.map(BoardConversationMappingUtil.questionHistoryEntryOf),
    ticketForecasts:       state.ticketForecasts.map(BoardJobMappingUtil.ticketForecastOf),
    pipeline:              BoardPipelineMappingUtil.appliedPipelineOf(state.pipeline),
    pipelineSetup:         BoardPipelineMappingUtil.pipelineSetupOf(state.pipelineSetup),
    pipelineFlow:          BoardPipelineMappingUtil.pipelineFlowOf(state.pipelineFlow),
    profileRuns:           state.profileRuns.map(BoardPipelineMappingUtil.profileRunOf),
    gateCacheMarks:        state.gateCacheMarks.map(BoardPipelineMappingUtil.gateCacheMarkOf),
    stepRunTimes:          state.stepRunTimes.map(BoardPipelineMappingUtil.stepRunTimeOf),
    pipelineHistory:       BoardPipelineMappingUtil.pipelineHistoryOf(state.pipelineHistory),
    pipelineChoices:       BoardPipelineMappingUtil.pipelineChoicesOf(state.pipelineChoices),
    pipelineAgentDefaults: BoardPipelineMappingUtil.agentPairOf(state.pipelineAgentDefaults),
    entityAssignment:      BoardPipelineMappingUtil.entityAssignmentOf(state.entityAssignment),
    pictureLimits:         BoardConversationMappingUtil.pictureLimitsOf(state.pictureLimits),
    limits:                BoardPageMappingUtil.limitsOf(state.page.payload.limits),
    notices:               BoardReadingMappingUtil.noticesOf(state.notices),
    warnings:              BoardReadingMappingUtil.warningsOf(state.notices, NoticeWordingUtil.restartWarningIn(state.hephaestus.restartWarning)),
    attention:             attentionEntriesOf(state).map(BoardReadingMappingUtil.attentionEntryOf),
    today:                 BoardReadingMappingUtil.todayOf(
      todayCalendarDate,
      todayFiguresOf(state, todayCalendarDate),
    ),
    openDecisionIds:      openDecisions.map(({ decision }) => decision.id),
    escalatedDecisionIds: openDecisions.filter(({ escalated }) => escalated).map(({ decision }) => decision.id),
  };
}

export const BoardDocumentAssembly = Object.freeze({ boardDocumentOf });
