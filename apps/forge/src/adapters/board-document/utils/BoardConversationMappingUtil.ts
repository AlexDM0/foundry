/**
 * The board's conversations mapped into the contract's board document: the open decisions with each option's recommendation as a field,
 * the open incidents, the records a settled one or a session job left in the log, and what a picture sent with a message may be.
 */
import type {
  BoardDecisionDocument,
  BoardDecisionOptionDocument,
  BoardIncidentDocument,
  BoardPictureLimitsDocument,
  BoardQuestionHistoryEntryDocument
} from 'forge-contracts/BoardConversationDocuments';

import type { Decision, DecisionQuestionOption } from '../../../lib/tracker-model/@types/Decision.ts';
import type { Incident }                         from '../../../lib/tracker-model/@types/Incident.ts';
import type { LogRecord }                        from '../../../lib/tracker-model/@types/LogRecord.ts';
import type { PictureLimits }                    from '../../@types/BoardStateParts.ts';
import { RefusalDocumentUtil }                   from '../../utils/RefusalDocumentUtil.ts';

function decisionOptionOf(option: DecisionQuestionOption): BoardDecisionOptionDocument {
  return {
    label:         option.label,
    description:   option.description,
    isRecommended: option.isRecommended,
    ...(option.touches === undefined ? {} : { touches: [...option.touches] }),
    ...(option.tradeOff === undefined ? {} : { tradeOff: option.tradeOff }),
    ...(option.acceptanceEffect === undefined ? {} : { acceptanceEffect: option.acceptanceEffect }),
  };
}

function decisionOf(decision: Decision): BoardDecisionDocument {
  return {
    id:        decision.id,
    kind:      decision.kind,
    ticketIds: [...decision.ticketIds],
    jobId:     decision.jobId,
    askedBy:   decision.askedBy,
    questions: decision.questions.map((question) => ({
      question:    question.question,
      header:      question.header,
      multiSelect: question.multiSelect,
      options:     question.options.map(decisionOptionOf),
    })),
    context:  decision.context,
    openedAt: decision.openedAt,
  };
}

function incidentOf(incident: Incident): BoardIncidentDocument {
  return {
    id:              incident.id,
    kind:            incident.kind,
    ticketIds:       [...incident.ticketIds],
    jobId:           incident.jobId,
    facts:           { ...incident.facts },
    defaultMove:     incident.defaultMove,
    deliveredInTurn: incident.deliveredInTurn === null ? null : { jobId: incident.deliveredInTurn.jobId, chatSequence: incident.deliveredInTurn.chatSequence },
    openedAt:        incident.openedAt,
  };
}

/** A record's fields as stored, each as JSON carries it, with the ids of what it concerns beside them. */
function questionHistoryEntryOf(record: LogRecord): BoardQuestionHistoryEntryDocument {
  return {
    kind:   record.kind,
    at:     record.at,
    ...('jobId' in record ? { jobId: record.jobId } : {}),
    ...('ticketId' in record ? { ticketId: record.ticketId } : {}),
    ...('decisionId' in record ? { decisionId: record.decisionId } : {}),
    ...('incidentId' in record ? { incidentId: record.incidentId } : {}),
    fields: RefusalDocumentUtil.jsonFieldsOf(record.fields),
  };
}

function pictureLimitsOf(pictureLimits: PictureLimits | null): BoardPictureLimitsDocument | null {
  return pictureLimits === null ? null : { perMessage: pictureLimits.perMessage, sizeLimitBytes: pictureLimits.sizeLimitBytes, mediaTypes: [...pictureLimits.mediaTypes] };
}

export const BoardConversationMappingUtil = Object.freeze({
  decisionOf,
  incidentOf,
  questionHistoryEntryOf,
  pictureLimitsOf,
});
