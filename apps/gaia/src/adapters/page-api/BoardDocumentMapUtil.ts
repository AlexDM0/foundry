/**
 * Maps Gaia's board model out to the page's board contract, as `FleetDocumentMapUtil` maps the fleet: the board, each event of its stream
 * and each entry of a conversation stream. Every key is named one by one, so a key the model gains reaches the page only when the contract
 * names it. A notice or a warning that names a command leaves in Gaia's words (Gaia rule 4); a refusal keeps the forge's sentence.
 */
import type { BoardDecisionDocument, BoardQuestionHistoryEntryDocument }              from '../../../page/@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument, BoardUsageDocument }                                     from '../../../page/@types/board/BoardDocument.ts';
import type { BoardEventDocument }                                                    from '../../../page/@types/board/BoardEventDocument.ts';
import type { BoardAttentionEntryDocument, BoardLimitsDocument, BoardNoticeDocument } from '../../../page/@types/board/BoardFactDocuments.ts';
import type { BoardIncidentDocument }                                                 from '../../../page/@types/board/BoardIncidentDocument.ts';
import type {
  BoardEndedJobDocument,
  BoardForecastStepDocument,
  BoardJobDocument,
  BoardLastToolCallDocument,
  BoardMergeCandidateDocument,
  BoardMergeQueueDocument,
  BoardTicketForecastDocument,
} from '../../../page/@types/board/BoardJobDocuments.ts';
import type { BoardForgeRefusalDocument } from '../../../page/@types/board/BoardRelayDocuments.ts';
import type {
  BoardDraftQuestionDocument,
  BoardEpicDocument,
  BoardFilingDraftDocument,
  BoardPageDocument,
  BoardProgressDocument,
  BoardTaskDocument,
  BoardTicketDocument,
  BoardTicketDocumentSummaryDocument,
  BoardTicketDocumentsSummaryDocument,
  BoardViewRangeDocument,
} from '../../../page/@types/board/BoardTicketDocuments.ts';
import type { BoardTranscriptEntryDocument, ConversationDocument } from '../../../page/@types/board/ConversationDocument.ts';
import type { MarkdownRendering }                                  from '../../lib/markdown-render/MarkdownRenderer.ts';
import type { BoardProfileLine, BoardTranscriptEntry }             from '../../shared/@types/board/BoardConversation.ts';
import type { BoardDecision, BoardQuestionHistoryEntry }           from '../../shared/@types/board/BoardDecision.ts';
import type { BoardEvent }                                         from '../../shared/@types/board/BoardEvent.ts';
import type { BoardAttentionEntry, BoardLimits, BoardNotice }      from '../../shared/@types/board/BoardFacts.ts';
import type { BoardIncident }                                      from '../../shared/@types/board/BoardIncident.ts';
import type {
  BoardEndedJob,
  BoardForecastStep,
  BoardJob,
  BoardLastToolCall,
  BoardMergeCandidate,
  BoardMergeQueue,
  BoardTicketForecast,
} from '../../shared/@types/board/BoardJob.ts';
import type { BoardRefusal } from '../../shared/@types/board/BoardRefusal.ts';
import type {
  BoardDraftQuestion,
  BoardEpic,
  BoardFilingDraft,
  BoardPage,
  BoardProgress,
  BoardTask,
  BoardTicket,
  BoardTicketDocumentSummary,
  BoardTicketDocumentsSummary,
  BoardViewRange,
} from '../../shared/@types/board/BoardTicket.ts';
import type { BoardUsage, ForgeBoard } from '../../shared/@types/board/ForgeBoard.ts';
import { PAGE_CONTRACT_VERSIONS }      from '../../shared/constants/PageContractVersions.ts';
import { BoardAgentDocumentMapUtil }   from './BoardAgentDocumentMapUtil.ts';
import { ForgeSentenceUtil }           from './ForgeSentenceUtil.ts';
import { PipelineDocumentMapUtil }     from './PipelineDocumentMapUtil.ts';

const BOARD_VERSION = { boardVersion: PAGE_CONTRACT_VERSIONS.gaiaBoard } as const;

function attentionEntryOut(entry: BoardAttentionEntry): BoardAttentionEntryDocument {
  return {
    key:                     entry.key,
    kind:                    entry.kind,
    idText:                  entry.idText,
    ticketIds:               entry.ticketIds,
    subject:                 entry.subject,
    jobId:                   entry.jobId,
    askedBy:                 entry.askedBy,
    decisionKind:            entry.decisionKind,
    escalatedFromIncidentId: entry.escalatedFromIncidentId,
    metaText:                entry.metaText,
    stamp:                   entry.stamp,
    stampWord:               entry.stampWord,
    actionLabel:             entry.actionLabel,
    target:                  { subject: entry.target.subject, id: entry.target.id },
  };
}

/** A cause sentence that names a command is dropped, and the notice's own sentence then stands alone. */
function noticeOut(notice: BoardNotice): BoardNoticeDocument {
  return {
    kind:      notice.kind,
    facts:     notice.facts,
    text:      ForgeSentenceUtil.noticeSentenceOf(notice.kind, notice.sentence),
    causeText: notice.causeSentence === null ? null : ForgeSentenceUtil.sentenceNamingNoCommandOf(notice.causeSentence),
  };
}

function warningOut(warning: BoardNotice): BoardNoticeDocument {
  return {
    kind:      warning.kind,
    facts:     warning.facts,
    text:      ForgeSentenceUtil.warningSentenceOf(warning.sentence),
    causeText: warning.causeSentence === null ? null : ForgeSentenceUtil.sentenceNamingNoCommandOf(warning.causeSentence),
  };
}

function limitsOut(limits: BoardLimits): BoardLimitsDocument {
  return {
    tickStepLadderMinutes:      limits.tickStepLadderMinutes,
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
    concurrency:                {
      lowest:       limits.concurrency.lowest,
      ceiling:      limits.concurrency.ceiling,
      defaultLimit: limits.concurrency.defaultLimit,
    },
    workerModel:               limits.workerModel,
    workerEffort:              limits.workerEffort,
    reworkRoundThresholdLines: limits.reworkRoundThresholdLines,
    defaultTicketPriority:     limits.defaultTicketPriority,
    firstRepeatReviewRound:    limits.firstRepeatReviewRound,
    defaultInstructionsOfRole: PipelineDocumentMapUtil.recordOutOf(
      limits.defaultInstructionsOfRole,
      (instructions) => instructions.map(PipelineDocumentMapUtil.instructionOut),
    ),
    reReviewThresholdStepLines: limits.reReviewThresholdStepLines,
    defaultAgentPairOfRole:     PipelineDocumentMapUtil.recordOutOf(limits.defaultAgentPairOfRole, (pair) => ({ model: pair.model, effort: pair.effort })),
    defaultDocumentsOfRole:     {
      builder:  { spec: limits.defaultDocumentsOfRole.builder.spec, plan: limits.defaultDocumentsOfRole.builder.plan },
      reviewer: { spec: limits.defaultDocumentsOfRole.reviewer.spec, plan: limits.defaultDocumentsOfRole.reviewer.plan },
    },
    fixedDocumentsOfRole: {
      builder:  [...limits.fixedDocumentsOfRole.builder],
      reviewer: [...limits.fixedDocumentsOfRole.reviewer],
    },
    defaultApprovals: {
      tickets: limits.defaultApprovals.tickets,
      merge:   limits.defaultApprovals.merge,
      spec:    limits.defaultApprovals.spec,
      plan:    limits.defaultApprovals.plan,
    },
    defaultTicketWritingRoute: limits.defaultTicketWritingRoute,
  };
}

function decisionOut(decision: BoardDecision): BoardDecisionDocument {
  return {
    id:        decision.id,
    kind:      decision.kind,
    ticketIds: decision.ticketIds,
    jobId:     decision.jobId,
    askedBy:   decision.askedBy,
    questions: decision.questions.map((question) => ({
      question:    question.question,
      header:      question.header,
      multiSelect: question.multiSelect,
      options:     question.options.map((option) => ({
        label:            option.label,
        description:      option.description,
        recommended:      option.recommended,
        touches:          option.touches,
        tradeOff:         option.tradeOff,
        acceptanceEffect: option.acceptanceEffect,
      })),
    })),
    context:  decision.context,
    openedAt: decision.openedAt,
  };
}

function questionHistoryEntryOut(entry: BoardQuestionHistoryEntry): BoardQuestionHistoryEntryDocument {
  return {
    kind:       entry.kind,
    at:         entry.at,
    jobId:      entry.jobId,
    ticketId:   entry.ticketId,
    decisionId: entry.decisionId,
    incidentId: entry.incidentId,
    fields:     entry.fields,
  };
}

function incidentOut(incident: BoardIncident): BoardIncidentDocument {
  return {
    id:              incident.id,
    kind:            incident.kind,
    ticketIds:       incident.ticketIds,
    jobId:           incident.jobId,
    facts:           incident.facts,
    defaultMove:     incident.defaultMove,
    deliveredInTurn: incident.deliveredInTurn === null ? null : {
      jobId:        incident.deliveredInTurn.jobId,
      chatSequence: incident.deliveredInTurn.chatSequence,
    },
    openedAt: incident.openedAt,
  };
}

function lastToolCallOut(toolCall: BoardLastToolCall | null): BoardLastToolCallDocument | null {
  return toolCall === null ? null : { toolName: toolCall.toolName, startedAt: toolCall.startedAt, running: toolCall.running };
}

function jobOut(job: BoardJob): BoardJobDocument {
  const { live } = job;
  return {
    id:            job.id,
    kind:          job.kind,
    role:          job.role,
    ticketIds:     job.ticketIds,
    state:         job.state,
    attempt:       job.attempt,
    childInstance: job.childInstance,
    crashResumes:  job.crashResumes,
    launchedAt:    job.launchedAt,
    airlockPhase:  job.airlockPhase,
    interruption:  job.interruption,
    lostLine:      job.lostLine === null ? null : { line: job.lostLine.line, cause: job.lostLine.cause },
    waitsFor:      job.waitsFor,
    stopRequest:   job.stopRequest,
    intake:        job.intake === null ? null : { text: job.intake.text, title: job.intake.title },
    entity:        job.entity,
    notLaunched:   BoardAgentDocumentMapUtil.notLaunchedOut(job.notLaunched),
    live:          {
      calls:        live.calls,
      callBudget:   live.callBudget,
      tokens:       live.tokens,
      toolCalls:    live.toolCalls,
      lastToolCall: lastToolCallOut(live.lastToolCall),
      subagents:    live.subagents.map((subagent) => ({
        parentToolUseId: subagent.parentToolUseId,
        toolCalls:       subagent.toolCalls,
        lastToolCall:    lastToolCallOut(subagent.lastToolCall),
        tokens:          subagent.tokens,
        state:           subagent.state,
        description:     subagent.description,
      })),
      toolCallsWithSubagents: live.toolCallsWithSubagents,
      silentSweeps:           live.silentSweeps,
      turn:                   live.turn,
      messagesWaiting:        live.messagesWaiting,
      lastLine:               live.lastLine === null ? null : { role: live.lastLine.role, text: live.lastLine.text, at: live.lastLine.at },
    },
    stopHolds: { stop: job.stopHolds.stop, windDown: job.stopHolds.windDown },
    offers:    { stopModes: job.offers.stopModes, takesFresh: job.offers.takesFresh, takesMessage: job.offers.takesMessage },
  };
}

function endedJobOut(job: BoardEndedJob): BoardEndedJobDocument {
  return {
    id:        job.id,
    kind:      job.kind,
    role:      job.role,
    ticketIds: job.ticketIds,
    attempt:   job.attempt,
    outcome:   job.outcome,
    cause:     job.cause,
    endedAt:   job.endedAt,
  };
}

function forecastStepOut(step: BoardForecastStep): BoardForecastStepDocument {
  switch (step.kind) {
    case 'build':
      return { kind: 'build', attempt: step.attempt, jobId: step.jobId };
    case 'customs-and-gates':
      return { kind: 'customs-and-gates', gateNames: step.gateNames, jobId: step.jobId };
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

function ticketForecastOut(forecast: BoardTicketForecast): BoardTicketForecastDocument {
  return {
    ticketId:         forecast.ticketId,
    steps:            forecast.steps.map(forecastStepOut),
    currentStepIndex: forecast.currentStepIndex,
    dependents:       forecast.dependents.map((dependent) => ({
      ticketId:                dependent.ticketId,
      stillWaitingOnTicketIds: dependent.stillWaitingOnTicketIds,
    })),
  };
}

function mergeCandidateOut(candidate: BoardMergeCandidate): BoardMergeCandidateDocument {
  return {
    ticketId:        candidate.ticketId,
    priority:        candidate.priority,
    againstTarget:   candidate.againstTarget,
    conflictedFiles: candidate.conflictedFiles,
  };
}

function mergeQueueOut(mergeQueue: BoardMergeQueue): BoardMergeQueueDocument {
  return {
    queuedTicketIds: mergeQueue.queuedTicketIds,
    targets:         mergeQueue.targets.map((target) => ({
      target: target.target,
      holder: target.holder === null ? null : {
        jobId:     target.holder.jobId,
        ticketIds: target.holder.ticketIds,
        phase:     target.holder.phase,
      },
      order:                  target.order.map((entry) => ({ ...mergeCandidateOut(entry), conflictsCaused: entry.conflictsCaused })),
      waitingForMerge:        target.waitingForMerge.map(mergeCandidateOut),
      pairwiseConflicts:      target.pairwiseConflicts,
      targetMovedDecisionIds: target.targetMovedDecisionIds,
    })),
  };
}

function ticketDocumentSummaryOut(summary: BoardTicketDocumentSummary): BoardTicketDocumentSummaryDocument {
  return { standing: summary.standing, headNumber: summary.headNumber, approvedNumber: summary.approvedNumber };
}

function ticketDocumentsSummaryOut(summary: BoardTicketDocumentsSummary): BoardTicketDocumentsSummaryDocument {
  return { spec: ticketDocumentSummaryOut(summary.spec), plan: ticketDocumentSummaryOut(summary.plan), buildHeld: summary.buildHeld };
}

function ticketOut(ticket: BoardTicket, renderMarkdown: MarkdownRendering): BoardTicketDocument {
  return {
    id:              ticket.id,
    title:           ticket.title,
    type:            ticket.type,
    status:          ticket.status,
    priority:        ticket.priority,
    size:            ticket.size,
    hold:            ticket.hold,
    epics:           ticket.epics,
    group:           ticket.group,
    releasesGroup:   ticket.releasesGroup,
    dependsOn:       ticket.dependsOn,
    branch:          ticket.branch,
    commit:          ticket.commit,
    reason:          ticket.reason,
    network:         ticket.network,
    entity:          ticket.entity,
    crosses:         ticket.crosses,
    introducedBy:    ticket.introducedBy,
    foundInReview:   ticket.foundInReview,
    filedByJob:      ticket.filedByJob,
    task:            ticket.task,
    filed:           ticket.filed,
    updated:         ticket.updated,
    started:         ticket.started,
    finished:        ticket.finished,
    delivered:       ticket.delivered,
    abandonedAt:     ticket.abandonedAt,
    bodyHtml:        renderMarkdown(ticket.bodyMarkdown),
    sections:        ticket.sections.map((section) => ({ heading: section.heading, markdown: section.markdown })),
    acceptanceItems: ticket.acceptanceItems.map((item) => ({ label: item.label, text: item.text, waived: item.waived })),
    facts:           {
      resolvedPriority:     ticket.facts.resolvedPriority,
      settlesADependency:   ticket.facts.settlesADependency,
      isClosed:             ticket.facts.isClosed,
      noAgentHasPickedItUp: ticket.facts.noAgentHasPickedItUp,
      reviewRound:          ticket.facts.reviewRound,
      isRepeatReview:       ticket.facts.isRepeatReview,
    },
    offers: { kinds: ticket.offers.kinds, priorityChoices: ticket.offers.priorityChoices },
    ...ticket.documents === undefined ? {} : { documents: ticketDocumentsSummaryOut(ticket.documents) },
  };
}

function taskOut(task: BoardTask): BoardTaskDocument {
  return {
    id:             task.id,
    name:           task.name,
    status:         task.status,
    start:          task.start,
    end:            task.end,
    owner:          task.owner,
    note:           task.note,
    ticket:         task.ticket,
    tokens:         task.tokens,
    reviewed:       task.reviewed,
    reviewRound:    task.reviewRound,
    history:        task.history === null ? null : task.history.map((phase) => ({ status: phase.status, at: phase.at })),
    reviewOf:       task.reviewOf,
    reviewBarRound: task.reviewBarRound,
  };
}

function viewRangeOut(view: BoardViewRange): BoardViewRangeDocument {
  if (view.kind === 'auto') return { kind: 'auto' };
  return {
    kind: view.kind, from: view.from, to: view.to, tickMinutes: view.tickMinutes
  };
}

function progressOut(progress: BoardProgress): BoardProgressDocument {
  return {
    startedAt:         progress.startedAt,
    view:              viewRangeOut(progress.view),
    hephaestusSetting: progress.hephaestusSetting,
    tasks:             progress.tasks.map(taskOut),
    log:               progress.log.map((entry) => ({
      at:        entry.at,
      text:      entry.text,
      taskIds:   entry.taskIds,
      ticketIds: entry.ticketIds,
    })),
  };
}

function epicOut(epic: BoardEpic): BoardEpicDocument {
  return {
    key:                 epic.key,
    title:               epic.title,
    slot:                epic.slot,
    ticketIds:           epic.ticketIds,
    ticketCountByStatus: PipelineDocumentMapUtil.recordOutOf(epic.ticketCountByStatus, (count) => count),
    tokens:              epic.tokens,
    span:                epic.span === null ? null : { start: epic.span.start, end: epic.span.end },
  };
}

function draftQuestionOut(question: BoardDraftQuestion): BoardDraftQuestionDocument {
  return {
    id:          question.id,
    question:    question.question,
    context:     question.context,
    options:     question.options.map(PipelineDocumentMapUtil.questionOptionOut),
    multiple:    question.multiple,
    recommended: question.recommended,
    answer:      PipelineDocumentMapUtil.questionAnswerOut(question.answer),
    followUps:   question.followUps.map(draftQuestionOut),
  };
}

function filingDraftOut(draft: BoardFilingDraft): BoardFilingDraftDocument {
  return {
    id:                draft.id,
    title:             draft.title,
    claimOwner:        draft.claimOwner,
    openedAt:          draft.openedAt,
    state:             draft.state,
    openQuestionCount: draft.openQuestionCount,
    questions:         draft.questions.map(draftQuestionOut),
  };
}

function pageOut(page: BoardPage, renderMarkdown: MarkdownRendering): BoardPageDocument {
  const { facts } = page;
  return {
    progress:         progressOut(page.progress),
    epicDescriptions: page.epicDescriptions.map((description) => ({ key: description.key, descriptionHtml: renderMarkdown(description.descriptionMarkdown) })),
    draftRequests:    page.draftRequests.map((request) => ({ id: request.id, request: request.request })),
    facts:            {
      rows: facts.rows.map((row) => ({
        displayState:                   row.displayState,
        deliveredRowCountsAsReviewed:   row.deliveredRowCountsAsReviewed,
        ownRowPositionOfReviewedTicket: row.ownRowPositionOfReviewedTicket,
      })),
      tickets: facts.tickets.map((ticketFacts) => ({
        ticketId:           ticketFacts.ticketId,
        ownRowPosition:     ticketFacts.ownRowPosition,
        reviewBarPositions: ticketFacts.reviewBarPositions,
        displayState:       ticketFacts.displayState,
        waitingOnTicketIds: ticketFacts.waitingOnTicketIds,
        entity:             ticketFacts.entity,
        stage:              ticketFacts.stage === null ? null : { name: ticketFacts.stage.name, entity: ticketFacts.stage.entity },
      })),
      epics:        facts.epics.map(epicOut),
      readyTickets: facts.readyTickets.map((ticket) => ({ id: ticket.id, isHeld: ticket.isHeld })),
      drafts:       facts.drafts.map(filingDraftOut),
    },
    tickets: page.tickets.map((ticket) => ticketOut(ticket, renderMarkdown)),
  };
}

function usageOut(usage: BoardUsage): BoardUsageDocument {
  return {
    resetsAt: usage.resetsAt,
    window:   usage.window,
    windows:  usage.windows.map((window) => ({
      window:      window.window,
      lengthHours: window.lengthHours,
      utilization: window.utilization,
      resetsAt:    window.resetsAt,
    })),
  };
}

/**
 * Every Markdown the forge served leaves as the HTML field the page reads, rendered here on the server by `renderMarkdown`; the count of
 * other forges that follow this machine's agent program is Gaia's own, none where no other forge was read.
 */
function boardDocumentOf(board: ForgeBoard, renderMarkdown: MarkdownRendering, otherForgesFollowingMachine: number | null = 0): BoardDocument {
  return {
    ...BOARD_VERSION,
    trackerId:   board.trackerId,
    project:     board.project,
    hephaestus:  { state: board.hephaestus.state, paused: board.hephaestus.paused, codeVersion: board.hephaestus.codeVersion },
    concurrency: { limit: board.concurrency.limit, agentsInFlight: board.concurrency.agentsInFlight },
    launchSlots: {
      limit:                         board.launchSlots.limit,
      slotJobIds:                    board.launchSlots.slotJobIds,
      inProgressTicketIdsWithoutJob: board.launchSlots.inProgressTicketIdsWithoutJob,
    },
    usage:           usageOut(board.usage),
    page:            pageOut(board.page, renderMarkdown),
    mergeQueue:      mergeQueueOut(board.mergeQueue),
    jobs:            board.jobs.map(jobOut),
    endedJobs:       board.endedJobs.map(endedJobOut),
    decisions:       board.decisions.map(decisionOut),
    incidents:       board.incidents.map(incidentOut),
    questionHistory: board.questionHistory.map(questionHistoryEntryOut),
    ticketForecasts: board.ticketForecasts.map(ticketForecastOut),
    pipeline:        PipelineDocumentMapUtil.pipelineFactsOut(board.pipeline, renderMarkdown),
    assistantIsOn:   board.assistantIsOn,
    agent:           BoardAgentDocumentMapUtil.agentOut(board.agent, otherForgesFollowingMachine),
    pictureLimits:   board.pictureLimits === null ? null : {
      perMessage:     board.pictureLimits.perMessage,
      sizeLimitBytes: board.pictureLimits.sizeLimitBytes,
      mediaTypes:     board.pictureLimits.mediaTypes,
    },
    limits:               limitsOut(board.limits),
    notices:              board.notices.map(noticeOut),
    warnings:             board.warnings.map(warningOut),
    attention:            board.attention.map(attentionEntryOut),
    today:                { calendarDate: board.today.calendarDate, deliveredTickets: board.today.deliveredTickets, tokens: board.today.tokens },
    openDecisionIds:      board.openDecisionIds,
    escalatedDecisionIds: board.escalatedDecisionIds,
  };
}

function eventDocumentOf(event: BoardEvent): BoardEventDocument {
  return event.kind === 'board-changed' ? { ...BOARD_VERSION, kind: 'board-changed' } : { ...BOARD_VERSION, kind: 'part-changed', part: event.part };
}

function transcriptEntryOut(entry: BoardTranscriptEntry): BoardTranscriptEntryDocument {
  return {
    cursor:          entry.cursor,
    entryKey:        entry.entryKey,
    role:            entry.role,
    text:            entry.text,
    at:              entry.at,
    toolName:        entry.toolName,
    parentToolUseId: entry.parentToolUseId,
    toolUseId:       entry.toolUseId,
    asksUser:        entry.asksUser,
    model:           entry.model,
    tokens:          entry.tokens,
    clientAct:       entry.clientAct,
    sentBy:          entry.sentBy,
    chatSequence:    entry.chatSequence,
    incidentIds:     entry.incidentIds,
    pictures:        entry.pictures.map((picture) => ({
      pictureId: picture.pictureId,
      name:      picture.name,
      mediaType: picture.mediaType,
      bytes:     picture.bytes,
    })),
  };
}

function historyDocumentOf(entries: readonly BoardTranscriptEntry[]): ConversationDocument {
  return { ...BOARD_VERSION, kind: 'history', entries: entries.map(transcriptEntryOut) };
}

function messageDocumentOf(entry: BoardTranscriptEntry): ConversationDocument {
  return { ...BOARD_VERSION, kind: 'message', entry: transcriptEntryOut(entry) };
}

function profileLineDocumentOf(line: BoardProfileLine): ConversationDocument {
  return { ...BOARD_VERSION, kind: 'line', line: { text: line.text } };
}

/** The forge's sentence in `text`, byte for byte: a refusal is never reworded, even one that names a command (decision 45). */
function refusalDocumentOf(refusal: BoardRefusal): BoardForgeRefusalDocument {
  return PipelineDocumentMapUtil.refusalOut(refusal);
}

export const BoardDocumentMapUtil = {
  boardDocumentOf,
  eventDocumentOf,
  historyDocumentOf,
  messageDocumentOf,
  profileLineDocumentOf,
  refusalDocumentOf,
} as const;
