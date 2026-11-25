/**
 * Maps a forge's board document, its shape already checked, into Gaia's `ForgeBoard`: the page, the jobs, the decisions and incidents, the
 * merge queue and the served facts, each value list through `VocabularyMapUtil`. The pipeline facts are `PipelineMapUtil`'s.
 */
import type { BoardDecisionDocument, BoardIncidentDocument, BoardQuestionHistoryEntryDocument } from 'forge-contracts/BoardConversationDocuments';
import type {
  BoardEndedJobDocument,
  BoardJobDocument,
  BoardJobLiveFactsDocument,
  BoardLastToolCallDocument,
  BoardTicketForecastDocument,
  BoardTicketForecastStepDocument,
} from 'forge-contracts/BoardJobDocuments';
import type { BoardLimitsDocument }                                        from 'forge-contracts/BoardLimitsDocument';
import type { BoardMergeQueueDocument, BoardWaitingForMergeEntryDocument } from 'forge-contracts/BoardMergeQueueDocument';
import type {
  BoardDraftAnswerDocument,
  BoardDraftQuestionDocument,
  BoardDraftQuestionOptionDocument,
  BoardDraftSummaryDocument,
  BoardEpicRollupDocument,
  BoardPageDocument,
  BoardPageTicketFactsDocument,
  BoardTaskDocument,
  BoardTicketDocument,
  BoardTicketDraftDocument,
  BoardViewRangeDocument,
  TicketDocumentSummaryDocument,
} from 'forge-contracts/BoardPageDocuments';
import type { AgentPairDocument, BoardAppliedPipelineDocument, InstructionEntryDocument } from 'forge-contracts/BoardPipelineDocuments';
import type { BoardAttentionEntryDocument, BoardNoticeDocument }                          from 'forge-contracts/BoardReadingDocuments';
import type { ForgeBoardDocument }                                                        from 'forge-contracts/ForgeBoardDocument';
import type { ForgeRefusalDocument }                                                      from 'forge-contracts/ForgeRefusalDocument';

import type { BoardDecision, BoardQuestionHistoryEntry }      from '../../../shared/@types/board/BoardDecision.ts';
import type { BoardAttentionEntry, BoardLimits, BoardNotice } from '../../../shared/@types/board/BoardFacts.ts';
import type { BoardIncident }                                 from '../../../shared/@types/board/BoardIncident.ts';
import type {
  BoardEndedJob,
  BoardForecastStep,
  BoardJob,
  BoardJobLiveFacts,
  BoardLastToolCall,
  BoardMergeCandidate,
  BoardMergeQueue,
  BoardTicketForecast,
} from '../../../shared/@types/board/BoardJob.ts';
import type { BoardAgentPair, BoardInstruction, BoardPipelineFacts } from '../../../shared/@types/board/BoardPipeline.ts';
import type { BoardRefusal }                                         from '../../../shared/@types/board/BoardRefusal.ts';
import type {
  BoardDraftQuestion,
  BoardEpic,
  BoardFilingDraft,
  BoardPage,
  BoardPageTicketFacts,
  BoardQuestionAnswer,
  BoardQuestionOption,
  BoardTask,
  BoardTicket,
  BoardTicketDocumentSummary,
  BoardTicketDraft,
  BoardViewRange,
} from '../../../shared/@types/board/BoardTicket.ts';
import type { ForgeBoard }        from '../../../shared/@types/board/ForgeBoard.ts';
import type { ResumeWaitsOfJobs } from '../@types/ResumeWaitsOfJobs.ts';
import { BoardAgentMapUtil }      from './BoardAgentMapUtil.ts';
import { TicketDocumentsMapUtil } from './TicketDocumentsMapUtil.ts';
import { VocabularyMapUtil }      from './VocabularyMapUtil.ts';

const VOCABULARIES = VocabularyMapUtil.vocabularies;

function refusalOf(refusal: ForgeRefusalDocument): BoardRefusal {
  return { code: refusal.code, fields: refusal.fields, sentence: refusal.sentence };
}

function questionOptionOf(option: BoardDraftQuestionOptionDocument): BoardQuestionOption {
  return { letter: option.letter, text: option.text };
}

function questionAnswerOf(answer: BoardDraftAnswerDocument | null): BoardQuestionAnswer | null {
  if (answer === null) return null;
  if ('letters' in answer) return { form: 'letters', letters: answer.letters, answeredAt: answer.answeredAt };
  return { form: 'text', text: answer.text, answeredAt: answer.answeredAt };
}

function instructionOf(entry: InstructionEntryDocument): BoardInstruction {
  if (entry.kind === 'default-brief') return { kind: 'default-brief', role: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.pipelineAgentRole, entry.role) };
  if (entry.kind === 'file') return { kind: 'file', path: entry.path };
  return { kind: 'constitution' };
}

function agentPairOf(pair: AgentPairDocument): BoardAgentPair {
  return { model: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.agentModel, pair.model), effort: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.agentEffort, pair.effort) };
}

function documentReadingRulesOf(rules: BoardLimitsDocument['defaultDocumentsOfRole']['builder']): BoardLimits['defaultDocumentsOfRole']['builder'] {
  return VocabularyMapUtil.keyedRecordOf(VOCABULARIES.ticketDocumentKind, rules, (rule) => VocabularyMapUtil.gaiaValueOf(VOCABULARIES.documentReadingRule, rule));
}

function ticketDocumentSummaryOf(summary: TicketDocumentSummaryDocument): BoardTicketDocumentSummary {
  return {
    standing:       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.documentStanding, summary.standing),
    headNumber:     summary.headNumber,
    approvedNumber: summary.approvedNumber,
  };
}

/** Present only on a ticket the forge serves a documents summary for, so a ticket in the one-ticket route reads as before. */
function ticketDocumentsSummaryOf(ticket: BoardTicketDocument): Pick<BoardTicket, 'documents'> {
  if (ticket.documents === undefined) return {};
  const { spec, plan, buildHeld } = ticket.documents;
  return { documents: { spec: ticketDocumentSummaryOf(spec), plan: ticketDocumentSummaryOf(plan), buildHeld } };
}

function ticketDraftOf(draft: BoardTicketDraftDocument): BoardTicketDraft {
  return {
    stage:       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.draftStage, draft.stage),
    waitsOnUser: draft.waitsOnUser === null ? null : VocabularyMapUtil.gaiaValueOf(VOCABULARIES.draftWait, draft.waitsOnUser),
    agent:       draft.agent === null ? null : {
      jobId: draft.agent.jobId, role: draft.agent.role, tokens: draft.agent.tokens, since: draft.agent.since
    },
    waitingSince: draft.waitingSince,
  };
}

function ticketOf(ticket: BoardTicketDocument): BoardTicket {
  return {
    id:              ticket.id,
    title:           ticket.title,
    type:            VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketType, ticket.type),
    status:          VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketStatus, ticket.status),
    priority:        ticket.priority === undefined ? null : VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketPriority, ticket.priority),
    size:            ticket.size === undefined ? null : VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketSize, ticket.size),
    hold:            ticket.hold ?? null,
    epics:           ticket.epics ?? [],
    group:           ticket.group ?? null,
    releasesGroup:   ticket.releasesGroup === true,
    dependsOn:       ticket.dependsOn ?? [],
    branch:          ticket.branch ?? null,
    commit:          ticket.commit ?? null,
    reason:          ticket.reason ?? null,
    network:         ticket.network ?? [],
    entity:          ticket.entity ?? null,
    crosses:         ticket.crosses ?? [],
    introducedBy:    ticket.introducedBy ?? null,
    foundInReview:   ticket.foundInReview ?? null,
    filedByJob:      ticket.filedByJob ?? null,
    task:            ticket.task,
    filed:           ticket.filed,
    updated:         ticket.updated,
    started:         ticket.started,
    finished:        ticket.finished,
    delivered:       ticket.delivered,
    abandonedAt:     ticket.abandonedAt,
    bodyMarkdown:    ticket.bodyMarkdown,
    sections:        ticket.sections.map((section) => ({ heading: section.heading, markdown: section.markdown })),
    acceptanceItems: ticket.acceptanceItems.map((item) => ({ label: item.label, text: item.text, waived: item.waived })),
    facts:           {
      resolvedPriority:     VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketPriority, ticket.facts.resolvedPriority),
      settlesADependency:   ticket.facts.settlesADependency,
      isClosed:             ticket.facts.isClosed,
      noAgentHasPickedItUp: ticket.facts.noAgentHasPickedItUp,
      reviewRound:          ticket.facts.reviewRound,
      isRepeatReview:       ticket.facts.isRepeatReview,
    },
    offers: {
      kinds:           VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.offeredCommandKind, ticket.offers.kinds),
      priorityChoices: VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.ticketPriority, ticket.offers.priorityChoices),
    },
    ...ticketDocumentsSummaryOf(ticket),
    ...ticket.draft === undefined ? {} : { draft: ticketDraftOf(ticket.draft) },
  };
}

function taskOf(task: BoardTaskDocument): BoardTask {
  return {
    id:             task.id,
    name:           task.name,
    status:         VocabularyMapUtil.gaiaValueOf(VOCABULARIES.taskStatus, task.status),
    start:          task.start,
    end:            task.end,
    owner:          task.owner,
    note:           task.note,
    ticket:         task.ticket,
    tokens:         task.tokens,
    reviewed:       task.reviewed ?? null,
    reviewRound:    task.reviewRound ?? null,
    history:        task.history?.map((phase) => ({ status: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.taskStatus, phase.status), at: phase.at })) ?? null,
    reviewOf:       task.reviewOf ?? null,
    reviewBarRound: task.reviewBarRound ?? null,
  };
}

function viewRangeOf(range: BoardViewRangeDocument): BoardViewRange {
  if (range.kind === 'auto') return { kind: 'auto' };
  return {
    kind: range.kind, from: range.from, to: range.to, tickMinutes: range.tickMinutes
  };
}

function pageTicketFactsOf(facts: BoardPageTicketFactsDocument): BoardPageTicketFacts {
  return {
    ticketId:           facts.ticketId,
    ownRowPosition:     facts.ownRowPosition,
    reviewBarPositions: facts.reviewBarPositions,
    displayState:       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.displayState, facts.displayState),
    waitingOnTicketIds: facts.waitingOnTicketIds,
    entity:             facts.entity ?? null,
    stage:              facts.stage === undefined ? null : { name: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketStage, facts.stage.name), entity: facts.stage.entity },
  };
}

function epicOf(epic: BoardEpicRollupDocument): BoardEpic {
  return {
    key:                 epic.key,
    title:               epic.title,
    slot:                epic.slot,
    ticketIds:           epic.ticketIds,
    ticketCountByStatus: VocabularyMapUtil.keyedRecordOf(VOCABULARIES.ticketStatus, epic.ticketCountByStatus, (count) => count),
    tokens:              epic.tokens,
    span:                epic.span === null ? null : { start: epic.span.start, end: epic.span.end },
  };
}

function draftQuestionOf(question: BoardDraftQuestionDocument): BoardDraftQuestion {
  return {
    id:          question.id,
    question:    question.question,
    context:     question.context,
    options:     question.options.map(questionOptionOf),
    multiple:    question.multiple,
    recommended: question.recommended,
    answer:      questionAnswerOf(question.answer),
    followUps:   question.followUps.map(draftQuestionOf),
  };
}

function filingDraftOf(draft: BoardDraftSummaryDocument): BoardFilingDraft {
  return {
    id:                draft.id,
    title:             draft.title,
    claimOwner:        draft.claimOwner,
    openedAt:          draft.openedAt,
    state:             VocabularyMapUtil.gaiaValueOf(VOCABULARIES.draftState, draft.state),
    openQuestionCount: draft.openQuestionCount,
    questions:         draft.questions.map(draftQuestionOf),
  };
}

function pageOf(page: BoardPageDocument): BoardPage {
  const {
    progress, epicDescriptions, draftRequests, boardFacts
  } = page.payload;
  return {
    progress: {
      startedAt:         progress.startedAt,
      view:              viewRangeOf(progress.view),
      hephaestusSetting: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.hephaestusSetting, progress.hephaestusState),
      tasks:             progress.tasks.map(taskOf),
      log:               progress.log.map((entry) => ({
        at: entry.at, text: entry.text, taskIds: entry.taskIds ?? null, ticketIds: entry.ticketIds ?? null
      })),
    },
    epicDescriptions: epicDescriptions.map((description) => ({ key: description.key, descriptionMarkdown: description.descriptionMarkdown })),
    draftRequests:    draftRequests.map((draftRequest) => ({ id: draftRequest.id, request: draftRequest.request })),
    facts:            {
      rows: boardFacts.rows.map((row) => ({
        displayState:                   VocabularyMapUtil.gaiaValueOf(VOCABULARIES.displayState, row.displayState),
        deliveredRowCountsAsReviewed:   row.deliveredRowCountsAsReviewed,
        ownRowPositionOfReviewedTicket: row.ownRowPositionOfReviewedTicket,
      })),
      tickets:      boardFacts.tickets.map(pageTicketFactsOf),
      epics:        boardFacts.epics.map(epicOf),
      readyTickets: boardFacts.readyTickets.map((readyTicket) => ({ id: readyTicket.id, isHeld: readyTicket.held === true })),
      drafts:       boardFacts.drafts.map(filingDraftOf),
    },
    tickets: page.tickets.map(ticketOf),
  };
}

function lastToolCallOf(call: BoardLastToolCallDocument | null): BoardLastToolCall | null {
  return call === null ? null : { toolName: call.toolName, startedAt: call.startedAt, running: call.running };
}

function jobLiveFactsOf(live: BoardJobLiveFactsDocument): BoardJobLiveFacts {
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
      state:           VocabularyMapUtil.gaiaValueOf(VOCABULARIES.subagentState, subagent.state),
      description:     subagent.description,
    })),
    toolCallsWithSubagents: live.toolCallsWithSubagents,
    silentSweeps:           live.silentSweeps,
    turn:                   VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.jobTurn, live.turn),
    messagesWaiting:        live.messagesWaiting,
    lastLine:               live.lastLine === null ? null : {
      role: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.sessionLineRole, live.lastLine.role),
      text: live.lastLine.text,
      at:   live.lastLine.at,
    },
  };
}

function jobOf(job: BoardJobDocument, resumeWaits: ResumeWaitsOfJobs): BoardJob {
  return {
    id:            job.id,
    kind:          job.kind,
    role:          job.role,
    ticketIds:     job.ticketIds,
    state:         VocabularyMapUtil.gaiaValueOf(VOCABULARIES.jobState, job.state),
    attempt:       job.attempt,
    childInstance: job.childInstance,
    crashResumes:  job.crashResumes,
    launchedAt:    job.launchedAt,
    airlockPhase:  job.airlock?.phase ?? null,
    interruption:  VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.interruptionCause, job.interruption),
    lostLine:      job.lostLine === null ? null : {
      line:  VocabularyMapUtil.gaiaValueOf(VOCABULARIES.lostLineKind, job.lostLine.line),
      cause: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.interruptionCause, job.lostLine.cause),
    },
    waitsFor:    resumeWaits.get(job.id) ?? null,
    stopRequest: VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.jobStopRequest, job.stopRequest),
    intake:      job.intake === null ? null : { text: job.intake.text, title: job.intake.title },
    entity:      job.entity,
    notLaunched: BoardAgentMapUtil.notLaunchedOf(job.notLaunched),
    live:        jobLiveFactsOf(job.live),
    stopHolds:   { stop: job.stopHolds.stop, windDown: job.stopHolds.windDown },
    offers:      {
      stopModes:    VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.jobStopMode, job.offers.stopModes),
      takesFresh:   job.offers.takesFresh,
      takesMessage: job.offers.takesMessage,
    },
  };
}

function endedJobOf(job: BoardEndedJobDocument): BoardEndedJob {
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

function forecastStepOf(step: BoardTicketForecastStepDocument): BoardForecastStep {
  switch (step.kind) {
    case 'build':
      return { kind: 'build', attempt: step.attempt, jobId: step.jobId };
    case 'customs-and-gates':
      return { kind: 'customs-and-gates', gateNames: step.gateNames, jobId: step.jobId };
    case 'review':
      return { kind: 'review', round: step.round, jobId: step.jobId };
    case 'merge-approval':
    case 'land':
      return { kind: step.kind, target: step.target };
    case 'integrate':
      return { kind: 'integrate', target: step.target, group: step.group };
  }
}

function ticketForecastOf(forecast: BoardTicketForecastDocument): BoardTicketForecast {
  return {
    ticketId:         forecast.ticketId,
    steps:            forecast.steps.map(forecastStepOf),
    currentStepIndex: forecast.currentStepIndex,
    dependents:       forecast.dependents.map((dependent) => ({ ticketId: dependent.ticketId, stillWaitingOnTicketIds: dependent.stillWaitingOnTicketIds })),
  };
}

function mergeCandidateOf(entry: BoardWaitingForMergeEntryDocument): BoardMergeCandidate {
  return {
    ticketId:        entry.ticketId,
    priority:        VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketPriority, entry.priority),
    againstTarget:   VocabularyMapUtil.gaiaValueOf(VOCABULARIES.mergePrediction, entry.againstTarget),
    conflictedFiles: entry.conflictedFiles,
  };
}

function mergeQueueOf(mergeQueue: BoardMergeQueueDocument): BoardMergeQueue {
  return {
    queuedTicketIds: mergeQueue.queuedTicketIds,
    targets:         mergeQueue.targets.map((target) => ({
      target:                 target.target,
      holder:                 target.holder === null ? null : { jobId: target.holder.jobId, ticketIds: target.holder.ticketIds, phase: target.holder.phase },
      order:                  target.order.map((entry) => ({ ...mergeCandidateOf(entry), conflictsCaused: entry.conflictsCaused })),
      waitingForMerge:        target.waitingForMerge.map(mergeCandidateOf),
      pairwiseConflicts:      target.pairwiseConflicts.map(([first, second]) => [first, second] as const),
      targetMovedDecisionIds: target.targetMovedDecisionIds,
    })),
  };
}

function decisionOf(decision: BoardDecisionDocument): BoardDecision {
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
        letter:           option.letter,
        label:            option.label,
        description:      option.description,
        recommended:      option.recommended,
        touches:          option.touches ?? [],
        tradeOff:         option.tradeOff ?? null,
        acceptanceEffect: option.acceptanceEffect ?? null,
      })),
    })),
    context:   decision.context,
    openedAt:  decision.openedAt,
    document:  decision.document === undefined ? null : VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketDocumentKind, decision.document),
    anchor:    decision.anchor === undefined ? null : TicketDocumentsMapUtil.commentAnchorOf(decision.anchor),
    placement: decision.placement === undefined || decision.placement === null ? null : { from: decision.placement.from, to: decision.placement.to },
  };
}

function incidentOf(incident: BoardIncidentDocument): BoardIncident {
  return {
    id:              incident.id,
    kind:            incident.kind,
    ticketIds:       incident.ticketIds,
    jobId:           incident.jobId,
    facts:           incident.facts,
    defaultMove:     incident.defaultMove,
    deliveredInTurn: incident.deliveredInTurn === null ? null : { jobId: incident.deliveredInTurn.jobId, chatSequence: incident.deliveredInTurn.chatSequence },
    openedAt:        incident.openedAt,
  };
}

function questionHistoryEntryOf(entry: BoardQuestionHistoryEntryDocument): BoardQuestionHistoryEntry {
  return {
    kind:       entry.kind,
    at:         entry.at,
    jobId:      entry.jobId ?? null,
    ticketId:   entry.ticketId ?? null,
    decisionId: entry.decisionId ?? null,
    incidentId: entry.incidentId ?? null,
    fields:     entry.fields,
  };
}

function noticeOf(notice: BoardNoticeDocument): BoardNotice {
  return {
    kind: notice.kind, facts: notice.facts, sentence: notice.sentence, causeSentence: notice.causeSentence ?? null
  };
}

function attentionEntryOf(entry: BoardAttentionEntryDocument): BoardAttentionEntry {
  return {
    key:                     entry.key,
    kind:                    VocabularyMapUtil.gaiaValueOf(VOCABULARIES.attentionKind, entry.kind),
    idText:                  entry.idText,
    ticketIds:               entry.ticketIds,
    subject:                 entry.subject,
    jobId:                   entry.jobId,
    askedBy:                 entry.askedBy,
    decisionKind:            entry.decisionKind,
    escalatedFromIncidentId: entry.escalatedFromIncidentId,
    metaText:                entry.metaText,
    stamp:                   entry.stamp,
    stampWord:               VocabularyMapUtil.gaiaValueOf(VOCABULARIES.attentionStampWord, entry.stampWord),
    actionLabel:             VocabularyMapUtil.gaiaValueOf(VOCABULARIES.attentionActionLabel, entry.actionLabel),
    target:                  { subject: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.targetSubject, entry.target.subject), id: entry.target.id },
  };
}

function limitsOf(limits: BoardLimitsDocument): BoardLimits {
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
    concurrency:                { lowest: limits.concurrency.lowest, ceiling: limits.concurrency.ceiling, defaultLimit: limits.concurrency.default },
    workerModel:                VocabularyMapUtil.gaiaValueOf(VOCABULARIES.agentModel, limits.workerModel),
    workerEffort:               VocabularyMapUtil.gaiaValueOf(VOCABULARIES.agentEffort, limits.workerEffort),
    reworkRoundThresholdLines:  limits.reworkRoundThresholdLines,
    defaultTicketPriority:      VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketPriority, limits.defaultTicketPriority),
    firstRepeatReviewRound:     limits.firstRepeatReviewRound,
    defaultInstructionsOfRole:  VocabularyMapUtil.keyedRecordOf(VOCABULARIES.pipelineAgentRole, limits.defaultInstructionsOfRole, (entries) => entries.map(instructionOf)),
    reReviewThresholdStepLines: limits.reReviewThresholdStepLines,
    defaultAgentPairOfRole:     VocabularyMapUtil.keyedRecordOf(VOCABULARIES.pipelineAgentRole, limits.defaultAgentPairOfRole, agentPairOf),
    defaultDocumentsOfRole:     {
      builder:  documentReadingRulesOf(limits.defaultDocumentsOfRole.builder),
      reviewer: documentReadingRulesOf(limits.defaultDocumentsOfRole.reviewer),
    },
    fixedDocumentsOfRole: {
      builder:  VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.ticketDocumentKind, limits.fixedDocumentsOfRole.builder),
      reviewer: VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.ticketDocumentKind, limits.fixedDocumentsOfRole.reviewer),
    },
    defaultApprovals:          VocabularyMapUtil.keyedRecordOf(VOCABULARIES.pipelineApproval, limits.defaultApprovals, (isOn) => isOn),
    defaultTicketWritingRoute: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketWritingRoute, limits.defaultTicketWritingRoute),
  };
}

/** The switch is the stored pipeline's `assistant` key, which the forge writes only while it is on. */
function assistantIsOnIn(applied: BoardAppliedPipelineDocument): boolean {
  return applied.readingVerdict === 'readable' && applied.pipeline.assistant === true;
}

/**
 * The board without its pipeline facts, which the caller maps with `PipelineMapUtil` and hands in, and with what each waiting job follows,
 * which the forge serves in its presence rather than its board.
 */
function boardOf(trackerId: string, document: ForgeBoardDocument, pipeline: BoardPipelineFacts, resumeWaits: ResumeWaitsOfJobs): ForgeBoard {
  return {
    trackerId,
    project:    document.project,
    hephaestus: {
      state:       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.hephaestusState, document.hephaestus.state),
      paused:      document.hephaestus.paused,
      codeVersion: document.hephaestus.codeVersion,
    },
    concurrency: { limit: document.concurrency.limit, agentsInFlight: document.concurrency.agentsInFlight },
    launchSlots: {
      limit:                         document.launchSlots.limit,
      slotJobIds:                    document.launchSlots.slotJobIds,
      inProgressTicketIdsWithoutJob: document.launchSlots.inProgressTicketIdsWithoutJob,
    },
    usage: {
      resetsAt: document.usage.resetsAt,
      window:   document.usage.window,
      windows:  document.usage.windows.map((window) => ({
        window:      window.window,
        lengthHours: window.lengthHours,
        utilization: window.utilization,
        resetsAt:    window.resetsAt,
      })),
    },
    page:            pageOf(document.page),
    mergeQueue:      mergeQueueOf(document.mergeQueue),
    jobs:            document.jobs.map((job) => jobOf(job, resumeWaits)),
    endedJobs:       document.endedJobs.map(endedJobOf),
    decisions:       document.decisions.map(decisionOf),
    incidents:       document.incidents.map(incidentOf),
    questionHistory: document.questionHistory.map(questionHistoryEntryOf),
    ticketForecasts: document.ticketForecasts.map(ticketForecastOf),
    pipeline,
    assistantIsOn:   assistantIsOnIn(document.pipeline),
    agent:           BoardAgentMapUtil.agentOf(document.agent),
    pictureLimits:   document.pictureLimits === null ? null : {
      perMessage:     document.pictureLimits.perMessage,
      sizeLimitBytes: document.pictureLimits.sizeLimitBytes,
      mediaTypes:     document.pictureLimits.mediaTypes,
    },
    limits:               limitsOf(document.limits),
    notices:              document.notices.map(noticeOf),
    warnings:             document.warnings.map(noticeOf),
    attention:            document.attention.map(attentionEntryOf),
    today:                { calendarDate: document.today.calendarDate, deliveredTickets: document.today.deliveredTickets, tokens: document.today.tokens },
    openDecisionIds:      document.openDecisionIds,
    escalatedDecisionIds: document.escalatedDecisionIds,
  };
}

export const BoardMapUtil = {
  boardOf,
  refusalOf,
  questionOptionOf,
  questionAnswerOf,
  instructionOf,
} as const;
