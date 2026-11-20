/**
 * The finished readings of the board mapped into the contract's board document, so a view reads values and recomputes no rule of forge's:
 * what waits on User and what each entry opens, the worded notices and warnings, today's figures, each ticket's facts and offers, each
 * job's stop holds and offers, and the bounds and defaults forge's rules apply. Each reading is forge's own; this file only names fields.
 */
import type { BoardLimitsDocument } from 'forge-contracts/BoardLimitsDocument';
import type {
  BoardAttentionEntryDocument,
  BoardJobOffersDocument,
  BoardJobStopHoldsDocument,
  BoardNoticeDocument,
  BoardTicketFactsDocument,
  BoardTicketOffersDocument,
  BoardTodayDocument
} from 'forge-contracts/BoardReadingDocuments';

import type { PipelineAgentRole }                                                                              from '../../../lib/tracker-model/@types/Pipeline.ts';
import type { Task }                                                                                           from '../../../lib/tracker-model/@types/Task.ts';
import type { JobOffers, TicketOffers }                                                                        from '../../../lib/tracker-model/MoveOffers.ts';
import { CONCURRENCY_LIMIT_CEILING_AGENTS, DEFAULT_CONCURRENCY_LIMIT_AGENTS, LOWEST_CONCURRENCY_LIMIT_AGENTS } from '../../../lib/tracker-model/constants/ConcurrencyLimits.ts';
import { jobStopHoldOf }                                                                                       from '../../../lib/tracker-model/constants/JobStopHolds.ts';
import { DEFAULT_INSTRUCTIONS_OF_ROLE, RE_REVIEW_THRESHOLD_STEP_LINES }                                        from '../../../lib/tracker-model/constants/PipelineDefaults.ts';
import { FIRST_REPEAT_REVIEW_ROUND }                                                                           from '../../../lib/tracker-model/constants/ReviewRounds.ts';
import {
  TICKET_STATUSES_EDITABLE_WITHOUT_FORCE,
  TICKET_STATUSES_THAT_CLOSE_A_TICKET,
  TICKET_STATUSES_THAT_SETTLE_A_DEPENDENCY
} from '../../../lib/tracker-model/constants/Statuses.ts';
import { DEFAULT_TICKET_PRIORITY }                       from '../../../lib/tracker-model/constants/TicketFields.ts';
import { TicketDefaultsUtil }                            from '../../../lib/tracker-model/utils/TicketDefaultsUtil.ts';
import type { PageTicket, PageTicketFacts }              from '../../../shared/@types/PagePayload.ts';
import { DISPATCH_PROTOCOL }                             from '../../../shared/constants/DispatchProtocol.ts';
import { WORKER_EFFORT, WORKER_MODEL }                   from '../../../shared/constants/OverseerLimits.ts';
import type { AttentionEntry }                           from '../../../shared/monitor/AttentionEntries.ts';
import type { TodayFigures }                             from '../../../shared/monitor/TodayFigures.ts';
import { NoticeWordingUtil, type BatonPassWarningFacts } from '../../../shared/monitor/utils/NoticeWordingUtil.ts';
import { RefusalDocumentUtil }                           from '../../utils/RefusalDocumentUtil.ts';
import { BoardPipelineMappingUtil }                      from './BoardPipelineMappingUtil.ts';

/** The limits forge's rules apply, beside the page's figures in `limits`. */
export type BoardRuleLimitsDocument = Pick<BoardLimitsDocument,
  | 'concurrency'
  | 'workerModel'
  | 'workerEffort'
  | 'reworkRoundThresholdLines'
  | 'defaultTicketPriority'
  | 'firstRepeatReviewRound'
  | 'defaultInstructionsOfRole'
  | 'reReviewThresholdStepLines'>;

const REPEAT_REVIEW_DISPLAY_STATE = 're-review';

function attentionEntryOf(entry: AttentionEntry): BoardAttentionEntryDocument {
  return {
    key:                     entry.key,
    kind:                    entry.kind,
    idText:                  entry.idText,
    ticketIds:               [...entry.ticketIds],
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

/** Each notice that names a kind, its kind no fact of its own, with forge's sentence, and an incident default's cause worded too. */
function noticesOf(notices: readonly unknown[]): BoardNoticeDocument[] {
  return NoticeWordingUtil.noticeFactsIn(notices).map((notice) => {
    const causeSentence = NoticeWordingUtil.causeSentenceOf(notice);
    return {
      kind:     notice.kind,
      facts:    RefusalDocumentUtil.jsonFieldsOf(notice, 'kind'),
      sentence: NoticeWordingUtil.noticeSentenceOf(notice),
      ...(causeSentence === null ? {} : { causeSentence }),
    };
  });
}

/** The header's warnings as the monitor serves them, with the facts each sentence names. */
function warningsOf(notices: readonly unknown[], batonPassWarning: BatonPassWarningFacts | null): BoardNoticeDocument[] {
  return NoticeWordingUtil.wordedWarningsOf(NoticeWordingUtil.noticeFactsIn(notices), batonPassWarning)
    .map((warning) => ({ kind: warning.kind, facts: { ...warning.facts }, sentence: warning.text }));
}

function todayOf(calendarDate: string, figures: TodayFigures): BoardTodayDocument {
  return { calendarDate, deliveredTickets: figures.deliveredTickets, tokens: figures.tokens };
}

/**
 * What a view would derive from the ticket's status, priority and own row: the status classes the Board's rules single out, and the round
 * of a repeat review, which the views read as the first repeat round while the row counts none.
 */
function ticketFactsOf(ticket: PageTicket, boardFacts: PageTicketFacts | undefined, ownRow: Readonly<Task> | undefined): BoardTicketFactsDocument {
  const { status } = ticket;
  const isRepeatReview = boardFacts?.displayState === REPEAT_REVIEW_DISPLAY_STATE;
  return {
    resolvedPriority:     TicketDefaultsUtil.ticketPriorityOf(ticket),
    settlesADependency:   TICKET_STATUSES_THAT_SETTLE_A_DEPENDENCY.includes(status),
    isClosed:             TICKET_STATUSES_THAT_CLOSE_A_TICKET.includes(status),
    noAgentHasPickedItUp: TICKET_STATUSES_EDITABLE_WITHOUT_FORCE.includes(status),
    reviewRound:          ownRow?.reviewRound ?? (isRepeatReview ? FIRST_REPEAT_REVIEW_ROUND : null),
    isRepeatReview,
  };
}

function ticketOffersOf(offers: TicketOffers): BoardTicketOffersDocument {
  return { kinds: [...offers.kinds], priorityChoices: [...offers.priorityChoices] };
}

function jobOffersOf(offers: JobOffers): BoardJobOffersDocument {
  return { stopModes: [...offers.stopModes], takesFresh: offers.takesFresh, takesMessage: offers.takesMessage };
}

function jobStopHoldsOf(jobId: string): BoardJobStopHoldsDocument {
  return { stop: jobStopHoldOf('stop', jobId), windDown: jobStopHoldOf('wind-down', jobId) };
}

function defaultInstructionsOfRoleOf(): BoardLimitsDocument['defaultInstructionsOfRole'] {
  const instructionsOf = (role: PipelineAgentRole) => DEFAULT_INSTRUCTIONS_OF_ROLE[role].map(BoardPipelineMappingUtil.instructionEntryOf);
  return {
    productOwner:       instructionsOf('productOwner'),
    builder:            instructionsOf('builder'),
    reviewer:           instructionsOf('reviewer'),
    reReviewer:         instructionsOf('reReviewer'),
    conflictReReviewer: instructionsOf('conflictReReviewer'),
    pipelineAgent:      instructionsOf('pipelineAgent'),
    assistant:          instructionsOf('assistant'),
  };
}

function ruleLimitsOf(): BoardRuleLimitsDocument {
  return {
    concurrency: {
      lowest:  LOWEST_CONCURRENCY_LIMIT_AGENTS,
      ceiling: CONCURRENCY_LIMIT_CEILING_AGENTS,
      default: DEFAULT_CONCURRENCY_LIMIT_AGENTS,
    },
    workerModel:                WORKER_MODEL,
    workerEffort:               WORKER_EFFORT,
    reworkRoundThresholdLines:  DISPATCH_PROTOCOL.REWORK_ROUND_THRESHOLD_LINES,
    defaultTicketPriority:      DEFAULT_TICKET_PRIORITY,
    firstRepeatReviewRound:     FIRST_REPEAT_REVIEW_ROUND,
    defaultInstructionsOfRole:  defaultInstructionsOfRoleOf(),
    reReviewThresholdStepLines: RE_REVIEW_THRESHOLD_STEP_LINES,
  };
}

export const BoardReadingMappingUtil = Object.freeze({
  attentionEntryOf,
  noticesOf,
  warningsOf,
  todayOf,
  ticketFactsOf,
  ticketOffersOf,
  jobOffersOf,
  jobStopHoldsOf,
  ruleLimitsOf,
});
