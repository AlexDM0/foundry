/**
 * The Questions view as data: the open decisions in the answering order the forge serves, with the ones an Assistant escalated marked; the
 * answered ones from the log; and the notices, each with the id it is about and the forge's sentence, which add nothing to the count.
 */
import type { BoardDecisionDocument } from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }         from '../../../@types/board/BoardDocument.ts';
import type { BoardNoticeDocument }   from '../../../@types/board/BoardFactDocuments.ts';

/** An open decision, with whether an Assistant put an agent's report to User unchanged, as the forge serves it. */
export interface OpenDecision {
  readonly decision:  BoardDecisionDocument;
  readonly escalated: boolean;
}

/** The board fields the Questions view reads. */
export type QuestionsBoard = Pick<BoardDocument, 'decisions' | 'openDecisionIds' | 'escalatedDecisionIds' | 'questionHistory' | 'notices'>;

export interface AnsweredDecision {
  readonly decisionId: string;
  readonly answeredAt: string;
  /** The question's text to its answer, as Hephaestus stored it. */
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

function answeredDecisionsOf(board: Pick<QuestionsBoard, 'questionHistory'>): AnsweredDecision[] {
  return board.questionHistory
    .filter((record) => record.kind === 'decision-answered' && typeof record.decisionId === 'string')
    .map((record) => {
      const { answer } = record.fields;
      const pairs = typeof answer === 'object' && answer !== null ? Object.entries(answer).map(([question, text]) => [question, String(text)] as const) : [];
      return { decisionId: record.decisionId ?? '', answeredAt: record.at, answer: pairs };
    })
    .reverse();
}

/** The id a notice is about, in the form the board shows it everywhere: `I3`, `J7`, `#042`. */
function subjectTextOf(notice: BoardNoticeDocument): string | null {
  const { incidentId, jobId, ticketId } = notice.facts;
  if (typeof incidentId === 'string') return incidentId;
  if (typeof jobId === 'string') return jobId;
  return typeof ticketId === 'string' ? `#${ticketId}` : null;
}

function noticeEntryOf(notice: BoardNoticeDocument): NoticeEntry {
  return { kind: notice.kind, subjectText: subjectTextOf(notice), sentence: notice.text };
}

/** The open decisions in the order the forge serves for answering them; an id the board names no decision for is passed over. */
function openDecisionsOf(board: Pick<QuestionsBoard, 'decisions' | 'openDecisionIds' | 'escalatedDecisionIds'>): OpenDecision[] {
  const decisionById = new Map(board.decisions.map((decision) => [decision.id, decision]));
  const escalatedIds = new Set(board.escalatedDecisionIds);
  return board.openDecisionIds.flatMap((decisionId) => {
    const decision = decisionById.get(decisionId);
    return decision === undefined ? [] : [{ decision, escalated: escalatedIds.has(decisionId) }];
  });
}

function questionsModelOf(board: QuestionsBoard): QuestionsModel {
  return {
    openDecisions:     openDecisionsOf(board),
    answeredDecisions: answeredDecisionsOf(board),
    notices:           board.notices.map(noticeEntryOf),
    openQuestionCount: board.decisions.length,
  };
}

/** The tab title with the open-question count leading it, `(3) agent-progress`; the title alone with none open. */
function tabTitleOf(baseTitle: string, openQuestionCount: number): string {
  return openQuestionCount === 0 ? baseTitle : `(${openQuestionCount}) ${baseTitle}`;
}

/** The decisions opened since the ids seen before, in board order: each raises one browser notification. */
function newDecisionsOf(seenDecisionIds: ReadonlySet<string>, decisions: readonly BoardDecisionDocument[]): BoardDecisionDocument[] {
  return decisions.filter((decision) => !seenDecisionIds.has(decision.id));
}

export const QuestionsModelUtil = Object.freeze({
  questionsModelOf, openDecisionsOf, tabTitleOf, newDecisionsOf
});
