/**
 * An agent's question request routed by who can answer it: all-`system` questions open a `system-question` incident and all-`ticket` ones a
 * `malformed-ticket` incident for the Assistant; anything else opens an `agent-question` decision for User. Either way the job waits,
 * keeping its slot, and the option notes it gave with `question options` go onto their options.
 */
import type { AgentQuestion }              from '../../lib/agent-launch/AgentSessionEvent.ts';
import type { DecisionQuestion }           from '../../lib/tracker-model/@types/Decision.ts';
import type { IncidentKind }               from '../../lib/tracker-model/@types/Incident.ts';
import type { QuestionOptionNotes }        from '../../lib/tracker-model/@types/OptionConsequences.ts';
import type { Board }                      from '../../lib/tracker-model/Board.ts';
import { QUESTIONS_FACT, REQUEST_ID_FACT } from '../../lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { OptionConsequencesUtil }          from '../../lib/tracker-model/utils/OptionConsequencesUtil.ts';

export type QuestionRoute = 'agent-question' | Extract<IncidentKind, 'system-question' | 'malformed-ticket'>;

/** The reserved headers and the incident each opens when every question of a request carries it. */
const INCIDENT_KIND_OF_RESERVED_HEADER: Readonly<Record<string, QuestionRoute>> = {
  system: 'system-question',
  ticket: 'malformed-ticket',
};

function routeOf(questions: readonly Pick<AgentQuestion, 'header'>[]): QuestionRoute {
  const headers = new Set(questions.map((question) => question.header));
  const [onlyHeader] = headers;
  if (headers.size !== 1 || onlyHeader === undefined || !Object.hasOwn(INCIDENT_KIND_OF_RESERVED_HEADER, onlyHeader)) return 'agent-question';
  return INCIDENT_KIND_OF_RESERVED_HEADER[onlyHeader] ?? 'agent-question';
}

/** Exactly the agent's questions and options, field for field, each option with the consequences its note gave. */
function decisionQuestionsOf(questions: readonly AgentQuestion[], notes: readonly QuestionOptionNotes[]): DecisionQuestion[] {
  return questions.map((question) => ({
    question:    question.question,
    header:      question.header,
    multiSelect: question.multiSelect,
    options:     OptionConsequencesUtil.optionsWithNotes(question, notes),
  }));
}

/** Opens nothing for a request already answered or already open; a replayed request is never asked twice. */
function openQuestion(board: Board, jobId: string, requestId: string, questions: readonly AgentQuestion[], at: string): void {
  const job = board.jobById(jobId);
  if (job === undefined || job.answeredRequestIds.includes(requestId)) return;
  const route             = routeOf(questions);
  const decisionQuestions = decisionQuestionsOf(questions, board.takeQuestionOptionNotes(jobId, questions.map((question) => question.question)));
  if (route === 'agent-question') {
    board.openDecision({
      kind: 'agent-question', ticketIds: job.ticketIds, jobId, askedBy: job.role ?? 'hephaestus', requestId, questions: decisionQuestions, context: '',
    }, at);
  } else {
    board.openIncident({
      kind:        route,
      ticketIds:   job.ticketIds,
      jobId,
      facts:       { [REQUEST_ID_FACT]: requestId, [QUESTIONS_FACT]: JSON.stringify(decisionQuestions) },
      defaultMove: 'incident-escalate',
    }, at);
  }
  if (job.state === 'running') board.moveJob(jobId, 'waiting-for-answer', at);
}

export const QuestionRouting = Object.freeze({ routeOf, openQuestion });
