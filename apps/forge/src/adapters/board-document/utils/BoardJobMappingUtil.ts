/**
 * The board's jobs mapped into the contract's board document: each job with its live facts and its interruption in the monitor's cause
 * names, the jobs that left the board, the launch slots, and what lies ahead of each open ticket.
 */
import type {
  BoardEndedJobDocument,
  BoardJobDocument,
  BoardJobLiveFactsDocument,
  BoardLastToolCallDocument,
  BoardTicketForecastDocument,
  BoardTicketForecastStepDocument
} from 'forge-contracts/BoardJobDocuments';
import type { BoardJobOffersDocument }   from 'forge-contracts/BoardReadingDocuments';
import type { BoardLaunchSlotsDocument } from 'forge-contracts/ForgeBoardDocument';

import type { LaunchSlots }                              from '../../../domain/tracker-model/@types/LaunchSlots.ts';
import type { TicketForecast, TicketForecastStep }       from '../../../domain/tracker-model/@types/TicketForecast.ts';
import { AgentProgramWordingUtil }                       from '../../../shared/utils/AgentProgramWordingUtil.ts';
import type { EndedJob, JobWithLiveFacts, LastToolCall } from '../../@types/BoardStateParts.ts';
import { MONITOR_INTERRUPTION_CAUSE_OF_CAUSE }           from '../../constants/MonitorInterruptionCauseOfCause.ts';
import { BoardReadingMappingUtil }                       from './BoardReadingMappingUtil.ts';

function lastToolCallOf(lastToolCall: LastToolCall | null): BoardLastToolCallDocument | null {
  return lastToolCall === null ? null : { toolName: lastToolCall.toolName, startedAt: lastToolCall.startedAt, running: lastToolCall.running };
}

function liveFactsOf(live: JobWithLiveFacts['live']): BoardJobLiveFactsDocument {
  return {
    calls:        live.calls,
    callBudget:   live.callBudget,
    tokens:       live.tokens,
    toolCalls:    live.toolCalls,
    lastToolCall: lastToolCallOf(live.lastToolCall),
    subagents:    live.subagents.map((subagent) => ({
      parentToolUseId: subagent.parentToolUseId,
      toolCalls:       subagent.toolCalls,
      lastToolCall:    lastToolCallOf(subagent.lastToolCall),
      tokens:          subagent.tokens,
      state:           subagent.state,
      description:     subagent.description,
    })),
    toolCallsWithSubagents: live.toolCallsWithSubagents,
    silentSweeps:           live.silentSweeps,
    turn:                   live.turn,
    messagesWaiting:        live.messagesWaiting,
    lastLine:               live.lastLine === null ? null : { role: live.lastLine.role, text: live.lastLine.text, at: live.lastLine.at },
  };
}

/** `offers` are the Board's reading of what the job accepts now; its stop holds are read here from its id; `agentName` words a refused launch. */
function jobOf(job: JobWithLiveFacts, offers: BoardJobOffersDocument, agentName: string): BoardJobDocument {
  return {
    id:            job.id,
    kind:          job.kind,
    role:          job.role,
    ticketIds:     [...job.ticketIds],
    state:         job.state,
    attempt:       job.attempt,
    childInstance: job.childInstance,
    crashResumes:  job.crashResumes,
    launchedAt:    job.launchedAt,
    airlock:       job.airlock === undefined ? null : { phase: job.airlock.phase },
    interruption:  job.interruption === undefined ? null : MONITOR_INTERRUPTION_CAUSE_OF_CAUSE[job.interruption],
    lostLine:      job.lostLine === null ? null : { line: job.lostLine.line, cause: MONITOR_INTERRUPTION_CAUSE_OF_CAUSE[job.lostLine.cause] },
    stopRequest:   job.stopRequest ?? null,
    intake:        job.intake === undefined ? null : { text: job.intake.text, title: job.intake.title ?? null },
    entity:        job.entity ?? null,
    notLaunched:   job.notLaunched === undefined ? null : {
      cause:       job.notLaunched.cause,
      programPath: job.notLaunched.programPath,
      sentence:    AgentProgramWordingUtil.notLaunchedClauseOf(job.notLaunched.cause, agentName, job.notLaunched.programPath),
    },
    live:      liveFactsOf(job.live),
    stopHolds: BoardReadingMappingUtil.jobStopHoldsOf(job.id),
    offers,
  };
}

function endedJobOf(job: EndedJob): BoardEndedJobDocument {
  return {
    id:        job.id,
    kind:      job.kind,
    role:      job.role,
    ticketIds: [...job.ticketIds],
    attempt:   job.attempt,
    outcome:   job.outcome,
    cause:     job.cause,
    endedAt:   job.endedAt,
  };
}

function launchSlotsOf(launchSlots: LaunchSlots): BoardLaunchSlotsDocument {
  return {
    limit:                         launchSlots.limit,
    slotJobIds:                    [...launchSlots.slotJobIds],
    inProgressTicketIdsWithoutJob: [...launchSlots.inProgressTicketIdsWithoutJob],
  };
}

function forecastStepOf(step: TicketForecastStep): BoardTicketForecastStepDocument {
  switch (step.kind) {
    case 'build':
      return { kind: 'build', attempt: step.attempt, jobId: step.jobId };
    case 'customs-and-gates':
      return { kind: 'customs-and-gates', gateNames: [...step.gateNames], jobId: step.jobId };
    case 'review':
      return { kind: 'review', round: step.round, jobId: step.jobId };
    case 'merge-approval':
      return { kind: 'merge-approval', target: step.target };
    case 'land':
      return { kind: 'land', target: step.target };
    case 'integrate':
      return { kind: 'integrate', target: step.target, group: step.group };
  }
}

function ticketForecastOf(forecast: TicketForecast): BoardTicketForecastDocument {
  return {
    ticketId:         forecast.ticketId,
    steps:            forecast.steps.map(forecastStepOf),
    currentStepIndex: forecast.currentStepIndex,
    dependents:       forecast.dependents.map((dependent) => ({ ticketId: dependent.ticketId, stillWaitingOnTicketIds: [...dependent.stillWaitingOnTicketIds] })),
  };
}

export const BoardJobMappingUtil = Object.freeze({
  jobOf,
  endedJobOf,
  launchSlotsOf,
  ticketForecastOf,
});
