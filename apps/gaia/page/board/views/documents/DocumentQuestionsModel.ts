/**
 * The document agent's questions to User on its document, pure (`docs/design/agent-questions.md`). An open question is an open decision the
 * spec or plan agent asked on this ticket's document; an answered one is the document's message that carries its decision id and the
 * answer's parts. Each question has its `E<n>` chip on the line its anchor stands on now and its lines marked, and lists under the
 * document's own "Open questions" heading until its answer settles: the agent's edit for it is applied, or the agent's turn on it ended
 * with no edit for it waiting.
 */
import type { MarkdownBlock }                                                                       from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardDecisionDocument, BoardDecisionOptionDocument }                                  from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardTicketDocumentKind }                                                             from '../../../@types/board/BoardVocabulary.ts';
import type { BoardDocumentMessageDocument, BoardDocumentProposalDocument, BoardLineRangeDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import { CountTextUtil }                                                                            from '../../../shared/utils/CountTextUtil.ts';
import type { DecisionOptionView }                                                                  from '../../conversation/DecisionAnswerUtil.ts';
import { OptionConsequencesUtil }                                                                   from '../../conversation/OptionConsequencesUtil.ts';
import { CommentPopoverModel }                                                                      from './CommentPopoverModel.ts';
import type { CommentChip }                                                                         from './DocumentBlocks.tsx';
import { DocumentSelectionModel }                                                                   from './DocumentSelectionModel.ts';

/** "E7 · § 3 Behaviour · line 16": the question's name and its lines in the mono face, the section in the text face. */
export interface QuestionAnchorParts {
  readonly questionName: string;
  readonly section:      string | null;
  readonly linesText:    string;
}

export interface QuestionOptionModel extends DecisionOptionView {
  /** The letter as the card shows it: `A`. */
  readonly letterText: string;
}

export interface OpenQuestionModel {
  readonly decisionId:  string;
  readonly question:    string;
  /** Why the agent asks; `null` where it gave no context. */
  readonly context:     string | null;
  readonly options:     readonly QuestionOptionModel[];
  readonly anchorParts: QuestionAnchorParts;
  /** The question's lines on the head now; `null` once they are gone. */
  readonly placement:   BoardLineRangeDocument | null;
}

export interface AnsweredQuestionModel {
  readonly decisionId:    string;
  readonly messageId:     string;
  readonly question:      string;
  /** The chosen option's label, or User's own words where the answer was free text. */
  readonly answerText:    string;
  readonly note:          string | null;
  readonly anchorParts:   QuestionAnchorParts | null;
  readonly placement:     BoardLineRangeDocument | null;
  /** The answer waits for the agent to finish its turn. */
  readonly waitsForAgent: boolean;
  /** The agent's edit for the answer is applied. */
  readonly applied:       boolean;
  /** Nothing more comes of the answer: its edit is applied, discarded or conflicted, or the agent's turn on it ended with no edit. */
  readonly settled:       boolean;
}

/** The agent's turns as its transcript holds them, numbered as a message's `agentTurn`; `null` while no transcript is read. */
export interface AgentTurnProgress {
  readonly newestTurn: number;
  readonly working:    boolean;
}

/** An item under the document's "Open questions" heading. */
export interface OpenQuestionsListItem {
  readonly decisionId:  string;
  readonly text:        string;
  readonly waitsOnUser: boolean;
}

export interface DocumentQuestions {
  readonly open:     readonly OpenQuestionModel[];
  readonly answered: readonly AnsweredQuestionModel[];
}

const FIRST_LETTER_CODE = 'a'.codePointAt(0) ?? 0;

const OPEN_QUESTIONS_HEADING = /^#{1,6}\s+(?:[\d.]+\s+)?Open questions\s*#*\s*$/iu;

function optionOf(option: BoardDecisionOptionDocument, optionIndex: number): QuestionOptionModel {
  const letter = option.letter === '' ? String.fromCodePoint(FIRST_LETTER_CODE + optionIndex) : option.letter;
  return {
    letter,
    letterText:   letter.toUpperCase(),
    label:        option.label,
    description:  option.description === '' ? null : option.description,
    recommended:  option.recommended,
    consequences: OptionConsequencesUtil.consequencesOf(option),
  };
}

/** The section is the page's own reading of the head at the lines, as a comment's is, so the document's title never leads it. */
function anchorPartsOf(
  decisionId: string,
  blocks: readonly MarkdownBlock[],
  anchorLines: BoardLineRangeDocument,
  anchorSectionPath: readonly string[],
  placement: BoardLineRangeDocument | null,
): QuestionAnchorParts {
  const sectionPath = placement === null ? anchorSectionPath : DocumentSelectionModel.sectionPathAt(blocks, placement.from);
  return {
    questionName: decisionId,
    section:      CommentPopoverModel.sectionTextOf(sectionPath),
    linesText:    CommentPopoverModel.linesTextOf(placement ?? anchorLines),
  };
}

/** The agent's open questions on this ticket's document, in the order they were asked; a decision of several questions is not one. */
function openQuestionsOf(
  decisions: readonly BoardDecisionDocument[],
  ticketId: string,
  document: BoardTicketDocumentKind,
  blocks: readonly MarkdownBlock[],
): OpenQuestionModel[] {
  return decisions.flatMap((decision): OpenQuestionModel[] => {
    const [asked] = decision.questions;
    if (decision.document !== document || !decision.ticketIds.includes(ticketId) || decision.anchor === null || asked === undefined) return [];
    const options = asked.options.map(optionOf);
    return [{
      decisionId:  decision.id,
      question:    asked.question,
      context:     decision.context.trim() === '' ? null : decision.context.trim(),
      options,
      anchorParts: anchorPartsOf(decision.id, blocks, decision.anchor.lines, decision.anchor.sectionPath, decision.placement),
      placement:   decision.placement,
    }];
  }).toSorted((a, b) => decisionNumberOf(a.decisionId) - decisionNumberOf(b.decisionId));
}

function decisionNumberOf(decisionId: string): number {
  const number = Number(decisionId.replace(/^\D+/u, ''));
  return Number.isFinite(number) ? number : 0;
}

/** An answer settles once its edit is decided, or once the turn that took it ended with no edit for it. */
function answerIsSettled(
  message: BoardDocumentMessageDocument, proposals: readonly BoardDocumentProposalDocument[], agentTurns: AgentTurnProgress | null
): boolean {
  if (message.state === 'applied') return true;
  if (message.state !== 'sent') return false;
  const edits = proposals.filter((proposal) => proposal.answersMessageId === message.messageId);
  if (edits.some((proposal) => proposal.state === 'proposed')) return false;
  if (edits.length > 0) return true;
  if (agentTurns === null || message.agentTurn === null) return false;
  return message.agentTurn < agentTurns.newestTurn || (message.agentTurn === agentTurns.newestTurn && !agentTurns.working);
}

function answeredQuestionOf(
  message: BoardDocumentMessageDocument,
  blocks: readonly MarkdownBlock[],
  proposals: readonly BoardDocumentProposalDocument[],
  agentTurns: AgentTurnProgress | null,
): AnsweredQuestionModel | null {
  if (message.decisionId === null || message.answer === null || message.state === 'withdrawn') return null;
  return {
    decisionId:    message.decisionId,
    messageId:     message.messageId,
    question:      message.answer.question,
    answerText:    message.answer.choice ?? message.answer.note ?? '',
    note:          message.answer.choice === null ? null : message.answer.note,
    anchorParts:   message.anchor === null ? null : anchorPartsOf(message.decisionId, blocks, message.anchor.lines, message.anchor.sectionPath, message.placement),
    placement:     message.placement,
    waitsForAgent: message.state === 'queued',
    applied:       message.state === 'applied',
    settled:       answerIsSettled(message, proposals, agentTurns),
  };
}

export interface DocumentQuestionsReading {
  readonly decisions:   readonly BoardDecisionDocument[];
  readonly messages:    readonly BoardDocumentMessageDocument[];
  readonly proposals?:  readonly BoardDocumentProposalDocument[];
  readonly agentTurns?: AgentTurnProgress | null;
  readonly ticketId:    string;
  readonly document:    BoardTicketDocumentKind;
  readonly blocks:      readonly MarkdownBlock[];
}

function documentQuestionsOf(reading: DocumentQuestionsReading): DocumentQuestions {
  const answered = reading.messages.flatMap((message) => {
    const answeredQuestion = answeredQuestionOf(message, reading.blocks, reading.proposals ?? [], reading.agentTurns ?? null);
    return answeredQuestion === null ? [] : [answeredQuestion];
  });
  return { open: openQuestionsOf(reading.decisions, reading.ticketId, reading.document, reading.blocks), answered };
}

/** A solid `E7` on an open question's line, a solid `✓ E7` once answered, and the applied look once its answer settles. */
function chipsOf(questions: DocumentQuestions): CommentChip[] {
  const openChips = questions.open.flatMap((question): CommentChip[] => (question.placement === null ? [] : [{
    key: question.decisionId, line: question.placement.to, text: question.decisionId, applied: false, asks: true, title: `Question ${question.decisionId} for you`,
  }]));
  const answeredChips = questions.answered.flatMap((answered): CommentChip[] => (answered.placement === null ? [] : [{
    key:     answered.messageId,
    line:    answered.placement.to,
    text:    `✓ ${answered.decisionId}`,
    applied: answered.settled,
    asks:    !answered.settled,
    title:   answered.applied ? `Question ${answered.decisionId}, answered and applied` : `Question ${answered.decisionId}, answered`,
  }]));
  return [...openChips, ...answeredChips];
}

/** The lines a question stands on, marked while it is open or its answer has not settled yet. */
function questionedLinesOf(questions: DocumentQuestions): BoardLineRangeDocument[] {
  return [
    ...questions.open.flatMap((question) => (question.placement === null ? [] : [question.placement])),
    ...questions.answered.flatMap((answered) => (answered.placement === null || answered.settled ? [] : [answered.placement])),
  ];
}

/** The line of the document's own "Open questions" heading, such as `## 6 Open questions`; `null` where it has none. */
function openQuestionsHeadingLineOf(markdown: string): number | null {
  const index = markdown.split('\n').findIndex((line) => OPEN_QUESTIONS_HEADING.test(line));
  return index < 0 ? null : index + 1;
}

/** Each open question, then each answered one whose answer has not settled: "Answered: Yes, add it here", a period added where it ends in none. */
function openQuestionsListOf(questions: DocumentQuestions): OpenQuestionsListItem[] {
  const answeredItemOf = (answered: AnsweredQuestionModel): OpenQuestionsListItem => {
    const text = /[.!?]$/u.test(answered.answerText) ? `Answered: ${answered.answerText}` : `Answered: ${answered.answerText}.`;
    return { decisionId: answered.decisionId, text, waitsOnUser: false };
  };
  return [
    ...questions.open.map((question) => ({ decisionId: question.decisionId, text: question.question, waitsOnUser: true })),
    ...questions.answered.filter((answered) => !answered.settled).map(answeredItemOf),
  ].toSorted((a, b) => decisionNumberOf(a.decisionId) - decisionNumberOf(b.decisionId));
}

/** The open question whose lines hold the line, else the first open one; `null` with none open. */
function questionAtLineOf(open: readonly OpenQuestionModel[], line: number | null): OpenQuestionModel | null {
  const atLine = line === null ? undefined : open.find((question) => question.placement !== null && question.placement.from <= line && line <= question.placement.to);
  return atLine ?? open[0] ?? null;
}

/** "2 questions open", `null` with none. */
function openCountTextOf(openCount: number): string | null {
  if (openCount === 0) return null;
  return `${CountTextUtil.countedPhrase(openCount, 'question', 'questions')} open`;
}

export const DocumentQuestionsModel = Object.freeze({
  documentQuestionsOf,
  chipsOf,
  questionedLinesOf,
  openQuestionsHeadingLineOf,
  openQuestionsListOf,
  questionAtLineOf,
  openCountTextOf,
});
