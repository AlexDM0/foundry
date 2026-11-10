/**
 * The Questions view as data: the open decisions, `agent-question` first, with the ones an Assistant escalated marked; the answered ones
 * from the log; and the notices, each with the id it is about and its sentence, which add nothing to the count.
 */
import type {
  ConversationBoardDocument,
  DecisionDocument,
  HistoryRecordDocument,
  NoticeDocument
} from '../../@types/ConversationDocuments.ts';
import { OpenDecisionsUtil, type OpenDecision } from '../../conversation/OpenDecisionsUtil.ts';
import { HeaderModelUtil }                      from '../../shell/HeaderModel.ts';

export interface AnsweredDecision {
  readonly decisionId: string;
  readonly answeredAt: string;
  /** The question's text to its answer, as the Overseer stored it. */
  readonly answer:     readonly (readonly [question: string, answer: string])[];
}

/** A notice as its card shows it: its kind, the id it is about when it names one, and its sentence. */
export interface NoticeEntry {
  readonly kind:        string;
  readonly subjectText: string | null;
  readonly sentence:    string;
}

export interface QuestionsModel {
  readonly openDecisions:     readonly OpenDecision[];
  readonly answeredDecisions: readonly AnsweredDecision[];
  readonly notices:           readonly NoticeEntry[];
  readonly openQuestionCount: number;
}

function historyOf(board: ConversationBoardDocument): readonly HistoryRecordDocument[] {
  return board.questionHistory ?? [];
}

function answeredDecisionsOf(board: ConversationBoardDocument): AnsweredDecision[] {
  return historyOf(board)
    .filter((record) => record.kind === 'decision-answered' && typeof record.decisionId === 'string')
    .map((record) => {
      const { answer } = record.fields;
      const pairs = typeof answer === 'object' && answer !== null ? Object.entries(answer).map(([question, text]) => [question, String(text)] as const) : [];
      return { decisionId: record.decisionId ?? '', answeredAt: record.at, answer: pairs };
    })
    .reverse();
}

/** The id a notice is about, in the form the Bridge shows it everywhere: `I3`, `J7`, `#042`. */
function subjectTextOf(notice: NoticeDocument): string | null {
  const { incidentId, jobId, ticketId } = notice;
  if (typeof incidentId === 'string') return incidentId;
  if (typeof jobId === 'string') return jobId;
  return typeof ticketId === 'string' ? `#${ticketId}` : null;
}

function noticeEntryOf(notice: NoticeDocument): NoticeEntry {
  return { kind: notice.kind, subjectText: subjectTextOf(notice), sentence: HeaderModelUtil.noticeSentenceOf(notice) };
}

function questionsModelOf(board: ConversationBoardDocument): QuestionsModel {
  return {
    openDecisions:     OpenDecisionsUtil.openDecisionsOf(board),
    answeredDecisions: answeredDecisionsOf(board),
    notices:           (board.notices ?? []).map(noticeEntryOf),
    openQuestionCount: board.decisions.length,
  };
}

/** The tab title with the open-question count leading it, `(3) agent-progress`; the title alone with none open. */
function tabTitleOf(baseTitle: string, openQuestionCount: number): string {
  return openQuestionCount === 0 ? baseTitle : `(${openQuestionCount}) ${baseTitle}`;
}

/** The decisions opened since the ids seen before, in board order: each raises one browser notification. */
function newDecisionsOf(seenDecisionIds: ReadonlySet<string>, decisions: readonly DecisionDocument[]): DecisionDocument[] {
  return decisions.filter((decision) => !seenDecisionIds.has(decision.id));
}

export const QuestionsModelUtil = Object.freeze({ questionsModelOf, tabTitleOf, newDecisionsOf });
