/**
 * The contract's board document of `GET /api/v1/board`, built from the same `BoardState` the Bridge's `GET /api/state` reads, part by part
 * through the board document's mappers. Its return type is the proof that the served document is the contract's.
 */
import type { ForgeBoardDocument } from 'forge-contracts/ForgeBoardDocument';

import { BoardConversationMappingUtil } from '../../adapters/board-document/utils/BoardConversationMappingUtil.ts';
import { BoardJobMappingUtil }          from '../../adapters/board-document/utils/BoardJobMappingUtil.ts';
import { BoardMergeQueueMappingUtil }   from '../../adapters/board-document/utils/BoardMergeQueueMappingUtil.ts';
import { BoardPageMappingUtil }         from '../../adapters/board-document/utils/BoardPageMappingUtil.ts';
import { BoardPipelineMappingUtil }     from '../../adapters/board-document/utils/BoardPipelineMappingUtil.ts';
import type { BoardState }              from './BoardState.ts';

function boardDocumentOf(state: BoardState): ForgeBoardDocument {
  return {
    project:               state.project,
    overseer:              BoardPageMappingUtil.overseerOf(state.overseer),
    concurrency:           BoardPageMappingUtil.concurrencyOf(state.page.payload.concurrency),
    launchSlots:           BoardJobMappingUtil.launchSlotsOf(state.launchSlots),
    confinement:           state.confinement,
    usage:                 BoardPageMappingUtil.usageOf(state.usage),
    page:                  BoardPageMappingUtil.pageOf(state.page),
    mergeQueue:            BoardMergeQueueMappingUtil.mergeQueueOf(state.mergeQueue),
    jobs:                  state.jobs.map(BoardJobMappingUtil.jobOf),
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
    notices:               BoardPageMappingUtil.noticesOf(state.notices),
  };
}

export const BoardDocumentAssembly = Object.freeze({ boardDocumentOf });
