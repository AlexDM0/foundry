/**
 * The board's page and the forge-wide figures beside it mapped into the contract's board document: the tickets, the task rows, the worded
 * log, the epics, the drafts and the Board's facts of each row and ticket, then the limits, the concurrency, the Overseer, the usage
 * windows and the notices. Every field is named, so a field the model gains reaches no reader until it is mapped here.
 */
import type { BoardLimitsDocument } from 'forge-contracts/BoardLimitsDocument';
import type {
  BoardDraftQuestionDocument,
  BoardDraftSummaryDocument,
  BoardEpicRollupDocument,
  BoardLogEntryDocument,
  BoardPageDocument,
  BoardPageTicketFactsDocument,
  BoardProgressDocument,
  BoardReadyTicketDocument,
  BoardRowFactsDocument,
  BoardTaskDocument,
  BoardTicketDocument
} from 'forge-contracts/BoardPageDocuments';
import type { BoardTicketFactsDocument, BoardTicketOffersDocument }                 from 'forge-contracts/BoardReadingDocuments';
import type { BoardConcurrencyDocument, BoardOverseerDocument, BoardUsageDocument } from 'forge-contracts/ForgeBoardDocument';

import type { DraftQuestion, DraftSummary } from '../../../lib/tracker-model/@types/Draft.ts';
import type { EpicRollup }                  from '../../../lib/tracker-model/@types/Epic.ts';
import type { Task }                        from '../../../lib/tracker-model/@types/Task.ts';
import type { ReadyTicket }                 from '../../../lib/tracker-model/@types/Ticket.ts';
import type {
  PageBoardFacts,
  PageConcurrency,
  PageLimits,
  PagePayload,
  PageRowFacts,
  PageTicket,
  PageTicketFacts
} from '../../../shared/@types/PagePayload.ts';
import type { IdentifiedLogEntry }        from '../../../shared/@types/WordedLogEntry.ts';
import { NoticeWordingUtil }              from '../../../shared/monitor/utils/NoticeWordingUtil.ts';
import type { OverseerFacts, UsageFacts } from '../../@types/BoardStateParts.ts';
import { BoardReadingMappingUtil }        from './BoardReadingMappingUtil.ts';

/** What forge reads of one ticket beyond its file: its facts and the commands it accepts now. */
export interface TicketReadings {
  readonly facts:  BoardTicketFactsDocument;
  readonly offers: BoardTicketOffersDocument;
}

function ticketOf(ticket: PageTicket, readings: TicketReadings): BoardTicketDocument {
  return {
    id:              ticket.id,
    title:           ticket.title,
    type:            ticket.type,
    status:          ticket.status,
    ...(ticket.priority === undefined ? {} : { priority: ticket.priority }),
    ...(ticket.size === undefined ? {} : { size: ticket.size }),
    ...(ticket.hold === undefined ? {} : { hold: ticket.hold }),
    ...(ticket.epics === undefined ? {} : { epics: [...ticket.epics] }),
    ...(ticket.group === undefined ? {} : { group: ticket.group }),
    ...(ticket.releasesGroup === undefined ? {} : { releasesGroup: ticket.releasesGroup }),
    ...(ticket.dependsOn === undefined ? {} : { dependsOn: [...ticket.dependsOn] }),
    ...(ticket.branch === undefined ? {} : { branch: ticket.branch }),
    ...(ticket.commit === undefined ? {} : { commit: ticket.commit }),
    ...(ticket.reason === undefined ? {} : { reason: ticket.reason }),
    ...(ticket.network === undefined ? {} : { network: [...ticket.network] }),
    ...(ticket.entity === undefined ? {} : { entity: ticket.entity }),
    ...(ticket.crosses === undefined ? {} : { crosses: [...ticket.crosses] }),
    ...(ticket.introducedBy === undefined ? {} : { introducedBy: ticket.introducedBy }),
    ...(ticket.foundInReview === undefined ? {} : { foundInReview: ticket.foundInReview }),
    ...(ticket.filedByJob === undefined ? {} : { filedByJob: ticket.filedByJob }),
    task:            ticket.task,
    filed:           ticket.filed,
    updated:         ticket.updated,
    started:         ticket.started,
    finished:        ticket.finished,
    delivered:       ticket.delivered,
    abandonedAt:     ticket.abandonedAt,
    bodyHtml:        ticket.bodyHtml,
    sections:        ticket.sections.map((section) => ({ heading: section.heading, markdown: section.markdown })),
    acceptanceItems: ticket.acceptanceItems.map((item) => ({ label: item.label, text: item.text, waived: item.waived })),
    facts:           readings.facts,
    offers:          readings.offers,
  };
}

function taskOf(task: Readonly<Task>): BoardTaskDocument {
  return {
    id:     task.id,
    name:   task.name,
    status: task.status,
    start:  task.start,
    end:    task.end,
    owner:  task.owner,
    note:   task.note,
    ticket: task.ticket,
    tokens: task.tokens,
    ...(task.reviewed === undefined ? {} : { reviewed: task.reviewed }),
    ...(task.reviewRound === undefined ? {} : { reviewRound: task.reviewRound }),
    ...(task.history === undefined ? {} : { history: task.history.map((phase) => ({ status: phase.status, at: phase.at })) }),
    ...(task.reviewOf === undefined ? {} : { reviewOf: task.reviewOf }),
    ...(task.reviewBarRound === undefined ? {} : { reviewBarRound: task.reviewBarRound }),
  };
}

function logEntryOf(entry: IdentifiedLogEntry): BoardLogEntryDocument {
  return {
    at:   entry.at,
    text: entry.text,
    ...(entry.taskIds === undefined ? {} : { taskIds: [...entry.taskIds] }),
    ...(entry.ticketIds === undefined ? {} : { ticketIds: [...entry.ticketIds] }),
  };
}

function progressOf(progress: PagePayload['progress']): BoardProgressDocument {
  return {
    startedAt: progress.startedAt,
    view:      progress.view.kind === 'auto' ? { kind: 'auto' } : {
      kind: progress.view.kind, from: progress.view.from, to: progress.view.to, tickMinutes: progress.view.tickMinutes
    },
    // An absent setting is a board the user never started, which reads as paused.
    overseerState: progress.overseerState ?? 'paused',
    tasks:         progress.tasks.map(taskOf),
    log:           progress.log.map(logEntryOf),
  };
}

function rowFactsOf(row: PageRowFacts): BoardRowFactsDocument {
  return {
    displayState:                   row.displayState,
    deliveredRowCountsAsReviewed:   row.deliveredRowCountsAsReviewed,
    ownRowPositionOfReviewedTicket: row.ownRowPositionOfReviewedTicket,
  };
}

function ticketFactsOf(facts: PageTicketFacts): BoardPageTicketFactsDocument {
  return {
    ticketId:           facts.ticketId,
    ownRowPosition:     facts.ownRowPosition,
    reviewBarPositions: [...facts.reviewBarPositions],
    displayState:       facts.displayState,
    waitingOnTicketIds: [...facts.waitingOnTicketIds],
    ...(facts.entity === undefined ? {} : { entity: facts.entity }),
    ...(facts.stage === undefined ? {} : { stage: { name: facts.stage.name, entity: facts.stage.entity } }),
  };
}

function epicRollupOf(epic: EpicRollup): BoardEpicRollupDocument {
  const counts = epic.ticketCountByStatus;
  return {
    key:                 epic.key,
    title:               epic.title,
    slot:                epic.slot,
    ticketIds:           [...epic.ticketIds],
    ticketCountByStatus: {
      'draft':            counts.draft,
      'ready-for-review': counts['ready-for-review'],
      'committed':        counts.committed,
      'in-progress':      counts['in-progress'],
      'in-review':        counts['in-review'],
      'reviewed':         counts.reviewed,
      'delivered':        counts.delivered,
      'abandoned':        counts.abandoned,
    },
    tokens: epic.tokens,
    span:   epic.span === null ? null : { start: epic.span.start, end: epic.span.end },
  };
}

function readyTicketOf(ready: ReadyTicket): BoardReadyTicketDocument {
  return { id: ready.id, ...(ready.held === undefined ? {} : { held: ready.held }) };
}

function draftQuestionOf(question: Readonly<DraftQuestion>): BoardDraftQuestionDocument {
  const { answer } = question;
  return {
    id:          question.id,
    question:    question.question,
    context:     question.context,
    options:     question.options.map((option) => ({ letter: option.letter, text: option.text })),
    multiple:    question.multiple,
    recommended: [...question.recommended],
    answer:      answer === null ? null : 'text' in answer
      ? { text: answer.text, answeredAt: answer.answeredAt }
      : { letters: [...answer.letters], answeredAt: answer.answeredAt },
    followUps: question.followUps.map(draftQuestionOf),
  };
}

function draftSummaryOf(draft: DraftSummary): BoardDraftSummaryDocument {
  return {
    id:                draft.id,
    title:             draft.title,
    claimOwner:        draft.claimOwner,
    openedAt:          draft.openedAt,
    state:             draft.state,
    openQuestionCount: draft.openQuestionCount,
    questions:         draft.questions.map(draftQuestionOf),
  };
}

function boardFactsOf(facts: PageBoardFacts): BoardPageDocument['payload']['boardFacts'] {
  return {
    rows:         facts.rows.map(rowFactsOf),
    tickets:      facts.tickets.map(ticketFactsOf),
    epics:        facts.epics.map(epicRollupOf),
    readyTickets: facts.readyTickets.map(readyTicketOf),
    drafts:       (facts.drafts ?? []).map(draftSummaryOf),
  };
}

function pageOf(page: { payload: PagePayload; tickets: readonly PageTicket[] }, readingsOf: (ticket: PageTicket) => TicketReadings): BoardPageDocument {
  const { payload } = page;
  return {
    payload: {
      progress:         progressOf(payload.progress),
      epicDescriptions: payload.epicDescriptions.map((description) => ({ key: description.key, descriptionHtml: description.descriptionHtml })),
      draftRequests:    (payload.draftRequests ?? []).map((draftRequest) => ({ id: draftRequest.id, request: draftRequest.request })),
      boardFacts:       boardFactsOf(payload.boardFacts),
    },
    tickets: page.tickets.map((ticket) => ticketOf(ticket, readingsOf(ticket))),
  };
}

function limitsOf(limits: PageLimits): BoardLimitsDocument {
  return {
    tickStepLadderMinutes:      [...limits.tickStepLadderMinutes],
    maximumTicksPerAxis:        limits.maximumTicksPerAxis,
    axisMinimumSpanMinutes:     limits.axisMinimumSpanMinutes,
    axisPaddingMinutes:         limits.axisPaddingMinutes,
    minimumBarWidthPercent:     limits.minimumBarWidthPercent,
    hoursAxisLabelLimitMinutes: limits.hoursAxisLabelLimitMinutes,
    weekAxisLabelLimitMinutes:  limits.weekAxisLabelLimitMinutes,
    hourMinutes:                limits.hourMinutes,
    dayMinutes:                 limits.dayMinutes,
    tickCountSafetyBound:       limits.tickCountSafetyBound,
    dateAndClockLength:         limits.dateAndClockLength,
    calendarDateLength:         limits.calendarDateLength,
    monthAndDaySliceStart:      limits.monthAndDaySliceStart,
    clockSliceStart:            limits.clockSliceStart,
    clockSliceEnd:              limits.clockSliceEnd,
    ...BoardReadingMappingUtil.ruleLimitsOf(),
  };
}

function concurrencyOf(concurrency: PageConcurrency): BoardConcurrencyDocument {
  return { limit: concurrency.limit, agentsInFlight: concurrency.agentsInFlight };
}

function overseerOf(overseer: OverseerFacts): BoardOverseerDocument {
  return {
    state:            overseer.state,
    paused:           overseer.paused,
    codeVersion:      overseer.codeVersion,
    batonPassWarning: NoticeWordingUtil.batonPassWarningIn(overseer.batonPassWarning),
  };
}

function usageOf(usage: UsageFacts): BoardUsageDocument {
  return {
    resetsAt: usage.resetsAt,
    window:   usage.window,
    windows:  usage.windows.map((usageWindow) => ({
      window: usageWindow.window, lengthHours: usageWindow.lengthHours, utilization: usageWindow.utilization, resetsAt: usageWindow.resetsAt
    })),
  };
}

export const BoardPageMappingUtil = Object.freeze({
  pageOf,
  limitsOf,
  concurrencyOf,
  overseerOf,
  usageOf,
});
